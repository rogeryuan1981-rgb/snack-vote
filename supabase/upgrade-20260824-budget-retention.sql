-- Snack Vote 增量升級：分離「本期留錢」與「本期使用上期留款」

alter table public.campaigns
add column if not exists retain_unused_budget boolean not null default false;

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
  if not found then return jsonb_build_object('campaign_id',null,'label',null,'remaining',0,'retained',false); end if;
  if not previous_campaign.retain_unused_budget then
    return jsonb_build_object('campaign_id',previous_campaign.id,'label',previous_campaign.label,'remaining',0,'retained',false);
  end if;
  select coalesce(sum(unit_price * coalesce(final_quantity,suggested_quantity)),0) into spent
  from public.purchase_items where campaign_id = previous_campaign.id;
  remaining := greatest(previous_campaign.budget - spent,0);
  return jsonb_build_object('campaign_id',previous_campaign.id,'label',previous_campaign.label,'budget',previous_campaign.budget,'spent',spent,'remaining',remaining,'retained',true);
end;
$$;

grant execute on function public.calculate_campaign_carryover(timestamptz, uuid) to authenticated;

