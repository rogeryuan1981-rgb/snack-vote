-- Keep an existing, unlocked purchase-plan draft synchronized with vote changes.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists purchase_plan_generated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_items'
  ) then
    alter publication supabase_realtime add table public.purchase_items;
  end if;
end;
$$;

-- Existing purchase plans predate the explicit draft marker. Mark them as generated
-- so future vote changes keep them synchronized even if recalculation makes them empty.
update public.campaigns c
set purchase_plan_generated_at = coalesce(
  c.purchase_plan_generated_at,
  (select min(pi.created_at) from public.purchase_items pi where pi.campaign_id = c.id),
  now()
)
where c.purchase_plan_generated_at is null
  and exists (
    select 1 from public.purchase_items pi where pi.campaign_id = c.id
  );

create or replace function public.generate_purchase_plan(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_budget numeric(12,2);
  remaining numeric(12,2);
  item record;
  buy_count integer;
  made_progress boolean;
  missing_prices integer;
begin
  -- Direct calls remain admin-only. Calls nested inside the protected vote trigger
  -- are allowed so employee vote changes can refresh an existing draft.
  if not public.is_admin() and pg_trigger_depth() = 0 then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select budget into campaign_budget
  from public.campaigns
  where id = p_campaign_id
    and purchase_plan_locked_at is null
  for update;

  if not found then
    if exists (select 1 from public.campaigns where id = p_campaign_id) then
      raise exception 'PURCHASE_PLAN_LOCKED';
    end if;
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  update public.campaigns
  set purchase_plan_generated_at = coalesce(purchase_plan_generated_at, now())
  where id = p_campaign_id;

  remaining := campaign_budget;

  with vote_counts as (
    select v.product_id, count(*)::integer as vote_count
    from public.votes v
    join public.products p on p.id = v.product_id
    where v.campaign_id = p_campaign_id
      and p.active
      and p.deleted_at is null
      and p.approval_status <> 'rejected'
      and exists (
        select 1 from public.nominations n
        where n.campaign_id = p_campaign_id
          and n.product_id = v.product_id
      )
    group by v.product_id
  ), ranked as (
    select product_id,
      rank() over (order by vote_count desc)::integer as rank
    from vote_counts
  )
  delete from public.purchase_items pi
  where pi.campaign_id = p_campaign_id
    and not exists (
      select 1 from ranked
      where ranked.product_id = pi.product_id and ranked.rank <= 5
    );

  -- Existing products keep their manually maintained purchase price.
  insert into public.purchase_items as target (
    campaign_id, product_id, rank, vote_count, unit_price,
    suggested_quantity, final_quantity, purchased
  )
  select
    p_campaign_id,
    ranked.product_id,
    ranked.rank,
    ranked.vote_count,
    coalesce(existing.unit_price, p.reference_price, 0),
    0,
    0,
    coalesce(existing.purchased, false)
  from (
    select
      v.product_id,
      count(*)::integer as vote_count,
      rank() over (order by count(*) desc)::integer as rank
    from public.votes v
    join public.products eligible on eligible.id = v.product_id
    where v.campaign_id = p_campaign_id
      and eligible.active
      and eligible.deleted_at is null
      and eligible.approval_status <> 'rejected'
      and exists (
        select 1 from public.nominations n
        where n.campaign_id = p_campaign_id
          and n.product_id = v.product_id
      )
    group by v.product_id
  ) ranked
  join public.products p on p.id = ranked.product_id
  left join public.purchase_items existing
    on existing.campaign_id = p_campaign_id
   and existing.product_id = ranked.product_id
  where ranked.rank <= 5
  on conflict (campaign_id, product_id) do update
  set rank = excluded.rank,
      vote_count = excluded.vote_count,
      unit_price = case
        when target.unit_price <= 0 then excluded.unit_price
        else target.unit_price
      end,
      suggested_quantity = 0,
      final_quantity = 0;

  for item in
    select * from public.purchase_items
    where campaign_id = p_campaign_id
    order by rank, product_id
  loop
    if item.unit_price > 0 then
      buy_count := least(2, floor(remaining / item.unit_price)::integer);
      if buy_count > 0 then
        update public.purchase_items
        set suggested_quantity = buy_count, final_quantity = buy_count
        where id = item.id;
        remaining := remaining - item.unit_price * buy_count;
      end if;
    end if;
  end loop;

  loop
    made_progress := false;
    for item in
      select * from public.purchase_items
      where campaign_id = p_campaign_id
      order by rank, product_id
    loop
      if item.unit_price > 0 and remaining >= item.unit_price then
        update public.purchase_items
        set suggested_quantity = suggested_quantity + 1,
            final_quantity = coalesce(final_quantity, 0) + 1
        where id = item.id;
        remaining := remaining - item.unit_price;
        made_progress := true;
      end if;
    end loop;
    exit when not made_progress;
  end loop;

  select count(*)::integer into missing_prices
  from public.purchase_items
  where campaign_id = p_campaign_id and unit_price <= 0;

  return jsonb_build_object(
    'budget', campaign_budget,
    'planned_amount', campaign_budget - remaining,
    'remaining', remaining,
    'missing_prices', missing_prices
  );
end;
$$;

grant execute on function public.generate_purchase_plan(uuid) to authenticated;

create or replace function public.sync_unlocked_purchase_plan_after_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
  previous_campaign_id uuid;
begin
  target_campaign_id := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  previous_campaign_id := case when tg_op = 'UPDATE' then old.campaign_id else null end;

  if exists (
    select 1
    from public.campaigns c
    where c.id = target_campaign_id
      and c.purchase_plan_locked_at is null
      and c.purchase_plan_generated_at is not null
  ) then
    perform public.generate_purchase_plan(target_campaign_id);
  end if;

  if previous_campaign_id is not null
    and previous_campaign_id is distinct from target_campaign_id
    and exists (
      select 1
      from public.campaigns c
      where c.id = previous_campaign_id
        and c.purchase_plan_locked_at is null
        and c.purchase_plan_generated_at is not null
    )
  then
    perform public.generate_purchase_plan(previous_campaign_id);
  end if;

  return null;
end;
$$;

drop trigger if exists votes_sync_unlocked_purchase_plan on public.votes;
drop trigger if exists votes_sync_unlocked_purchase_plan_insert on public.votes;
drop trigger if exists votes_sync_unlocked_purchase_plan_update on public.votes;
drop trigger if exists votes_sync_unlocked_purchase_plan_delete on public.votes;

create trigger votes_sync_unlocked_purchase_plan_insert
after insert on public.votes
for each row execute function public.sync_unlocked_purchase_plan_after_vote();

create trigger votes_sync_unlocked_purchase_plan_update
after update of campaign_id, product_id on public.votes
for each row execute function public.sync_unlocked_purchase_plan_after_vote();

create trigger votes_sync_unlocked_purchase_plan_delete
after delete on public.votes
for each row execute function public.sync_unlocked_purchase_plan_after_vote();

create or replace function public.sync_unlocked_purchase_plan_after_nomination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
  previous_campaign_id uuid;
begin
  target_campaign_id := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  previous_campaign_id := case when tg_op = 'UPDATE' then old.campaign_id else null end;

  if exists (
    select 1 from public.campaigns c
    where c.id = target_campaign_id
      and c.purchase_plan_locked_at is null
      and c.purchase_plan_generated_at is not null
  ) then
    perform public.generate_purchase_plan(target_campaign_id);
  end if;

  if previous_campaign_id is not null
    and previous_campaign_id is distinct from target_campaign_id
    and exists (
      select 1 from public.campaigns c
      where c.id = previous_campaign_id
        and c.purchase_plan_locked_at is null
        and c.purchase_plan_generated_at is not null
    )
  then
    perform public.generate_purchase_plan(previous_campaign_id);
  end if;

  return null;
end;
$$;

drop trigger if exists nominations_sync_unlocked_purchase_plan_insert on public.nominations;
drop trigger if exists nominations_sync_unlocked_purchase_plan_update on public.nominations;
drop trigger if exists nominations_sync_unlocked_purchase_plan_delete on public.nominations;

create trigger nominations_sync_unlocked_purchase_plan_insert
after insert on public.nominations
for each row execute function public.sync_unlocked_purchase_plan_after_nomination();

create trigger nominations_sync_unlocked_purchase_plan_update
after update of campaign_id, product_id on public.nominations
for each row execute function public.sync_unlocked_purchase_plan_after_nomination();

create trigger nominations_sync_unlocked_purchase_plan_delete
after delete on public.nominations
for each row execute function public.sync_unlocked_purchase_plan_after_nomination();

create or replace function public.sync_unlocked_purchase_plans_after_product_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_campaign record;
begin
  if new.active is not distinct from old.active
    and new.deleted_at is not distinct from old.deleted_at
    and new.approval_status is not distinct from old.approval_status
    and new.reference_price is not distinct from old.reference_price
  then
    return null;
  end if;

  for affected_campaign in
    select distinct c.id
    from public.campaigns c
    join public.votes v on v.campaign_id = c.id
    where v.product_id = new.id
      and c.purchase_plan_locked_at is null
      and c.purchase_plan_generated_at is not null
  loop
    perform public.generate_purchase_plan(affected_campaign.id);
  end loop;

  return null;
end;
$$;

drop trigger if exists products_sync_unlocked_purchase_plans on public.products;
create trigger products_sync_unlocked_purchase_plans
after update of active, deleted_at, approval_status, reference_price on public.products
for each row execute function public.sync_unlocked_purchase_plans_after_product_change();

notify pgrst, 'reload schema';
