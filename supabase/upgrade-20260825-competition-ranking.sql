-- Competition ranking: equal vote totals share a rank and the next rank is skipped.
-- Example: 3, 3, 2 votes => ranks 1, 1, 3.
-- Safe to run more than once in Supabase SQL Editor.

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
  for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;

  remaining := campaign_budget;
  delete from public.purchase_items where campaign_id = p_campaign_id;

  insert into public.purchase_items (
    campaign_id, product_id, rank, vote_count, unit_price,
    suggested_quantity, final_quantity, purchased
  )
  select
    p_campaign_id,
    ranked.product_id,
    ranked.rank,
    ranked.vote_count,
    coalesce(p.reference_price, 0),
    0,
    0,
    false
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
  where ranked.rank <= 5
  order by ranked.rank, ranked.product_id;

  -- First pass: up to two units for every product ranked 1 through 5.
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

  -- Then cycle through ranks 1 through 5 until no remaining item is affordable.
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

-- Correct ranks already stored in existing purchase plans without changing quantities.
with vote_counts as (
  select campaign_id, product_id, count(*)::integer as vote_count
  from public.votes
  group by campaign_id, product_id
), ranked as (
  select
    campaign_id,
    product_id,
    vote_count,
    rank() over (partition by campaign_id order by vote_count desc)::integer as rank
  from vote_counts
)
update public.purchase_items pi
set rank = ranked.rank,
    vote_count = ranked.vote_count
from ranked
where pi.campaign_id = ranked.campaign_id
  and pi.product_id = ranked.product_id;

notify pgrst, 'reload schema';
