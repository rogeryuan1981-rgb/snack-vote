-- Snack Vote 增量升級：每期基本預算與上期餘額結轉

alter table public.campaigns add column if not exists base_budget numeric(12,2);
alter table public.campaigns add column if not exists carryover_enabled boolean not null default false;
alter table public.campaigns add column if not exists carryover_amount numeric(12,2) not null default 0;
alter table public.campaigns add column if not exists carryover_from uuid references public.campaigns(id) on delete set null;

update public.campaigns set base_budget = budget where base_budget is null;
alter table public.campaigns alter column base_budget set not null;

alter table public.campaigns drop constraint if exists campaigns_base_budget_nonnegative;
alter table public.campaigns add constraint campaigns_base_budget_nonnegative check (base_budget >= 0);
alter table public.campaigns drop constraint if exists campaigns_carryover_nonnegative;
alter table public.campaigns add constraint campaigns_carryover_nonnegative check (carryover_amount >= 0);
alter table public.campaigns drop constraint if exists campaigns_budget_breakdown_matches;
alter table public.campaigns add constraint campaigns_budget_breakdown_matches
check (budget = base_budget + carryover_amount);

create or replace function public.calculate_campaign_carryover(
  p_start_at timestamptz,
  p_exclude_campaign_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous_campaign public.campaigns%rowtype; spent numeric(12,2) := 0; remaining numeric(12,2) := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into previous_campaign from public.campaigns
  where start_at < p_start_at and (p_exclude_campaign_id is null or id <> p_exclude_campaign_id)
  order by start_at desc limit 1;
  if not found then return jsonb_build_object('campaign_id',null,'label',null,'remaining',0); end if;
  select coalesce(sum(unit_price * coalesce(final_quantity,suggested_quantity)),0) into spent
  from public.purchase_items where campaign_id = previous_campaign.id;
  remaining := greatest(previous_campaign.budget - spent,0);
  return jsonb_build_object('campaign_id',previous_campaign.id,'label',previous_campaign.label,'budget',previous_campaign.budget,'spent',spent,'remaining',remaining);
end;
$$;

grant execute on function public.calculate_campaign_carryover(timestamptz, uuid) to authenticated;

