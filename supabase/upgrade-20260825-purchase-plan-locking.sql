-- Stable purchase editing, price-preserving recalculation, and purchase-plan locking.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists purchase_plan_locked_at timestamptz;

alter table public.campaigns
  add column if not exists purchase_plan_locked_by uuid
  references public.employees(id) on delete set null;

create or replace function public.set_purchase_plan_lock(
  p_campaign_id uuid,
  p_locked boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_time timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  if p_locked and not exists (
    select 1 from public.purchase_items where campaign_id = p_campaign_id
  ) then
    raise exception 'PURCHASE_PLAN_EMPTY';
  end if;

  locked_time := case when p_locked then now() else null end;

  update public.campaigns
  set purchase_plan_locked_at = locked_time,
      purchase_plan_locked_by = case when p_locked then public.current_employee_id() else null end
  where id = p_campaign_id;

  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  return locked_time;
end;
$$;

grant execute on function public.set_purchase_plan_lock(uuid, boolean) to authenticated;

create or replace function public.protect_locked_purchase_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
begin
  target_campaign_id := new.campaign_id;

  if exists (
    select 1 from public.campaigns
    where id = target_campaign_id
      and purchase_plan_locked_at is not null
  ) then
    if tg_op = 'INSERT' then
      raise exception 'PURCHASE_PLAN_LOCKED';
    end if;

    if new.campaign_id is distinct from old.campaign_id
      or new.product_id is distinct from old.product_id
      or new.rank is distinct from old.rank
      or new.vote_count is distinct from old.vote_count
      or new.unit_price is distinct from old.unit_price
      or new.suggested_quantity is distinct from old.suggested_quantity
      or new.final_quantity is distinct from old.final_quantity
    then
      raise exception 'PURCHASE_PLAN_LOCKED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_items_protect_locked_plan on public.purchase_items;
create trigger purchase_items_protect_locked_plan
before insert or update on public.purchase_items
for each row execute function public.protect_locked_purchase_plan();

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
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

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

  remaining := campaign_budget;

  -- Remove products that are no longer ranked 1 through 5.
  with vote_counts as (
    select product_id, count(*)::integer as vote_count
    from public.votes
    where campaign_id = p_campaign_id
    group by product_id
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

  -- Existing rows retain their manually maintained unit_price.
  -- Only newly ranked products start from the product reference price.
  insert into public.purchase_items (
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
    where v.campaign_id = p_campaign_id
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

notify pgrst, 'reload schema';
