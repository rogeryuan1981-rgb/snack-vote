-- Snack Vote 增量升級：上班地點、分地點活動與歷史活動維護基礎

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_locations_name_unique on public.work_locations(lower(btrim(name)));

insert into public.work_locations(name) values ('主要辦公室') on conflict do nothing;

alter table public.employees add column if not exists work_location_id uuid references public.work_locations(id) on delete restrict;
alter table public.campaigns add column if not exists work_location_id uuid references public.work_locations(id) on delete restrict;

update public.employees set work_location_id=(select id from public.work_locations order by created_at limit 1) where work_location_id is null;
update public.campaigns set work_location_id=(select id from public.work_locations order by created_at limit 1) where work_location_id is null;
alter table public.employees alter column work_location_id set not null;
alter table public.campaigns alter column work_location_id set not null;

alter table public.work_locations enable row level security;
drop policy if exists work_locations_select on public.work_locations;
create policy work_locations_select on public.work_locations for select to authenticated using (true);
drop policy if exists work_locations_admin_all on public.work_locations;
create policy work_locations_admin_all on public.work_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.work_locations to authenticated;

create or replace function public.snapshot_active_employees(p_campaign_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer; campaign_location uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select work_location_id into campaign_location from public.campaigns where id=p_campaign_id;
  if campaign_location is null then raise exception 'CAMPAIGN_LOCATION_REQUIRED'; end if;
  update public.campaign_members set active=false where campaign_id=p_campaign_id;
  insert into public.campaign_members(campaign_id,employee_id,name_snapshot,email_snapshot,active)
  select p_campaign_id,e.id,e.name,e.email,true from public.employees e
  where e.active and e.work_location_id=campaign_location
  on conflict(campaign_id,employee_id) do update set name_snapshot=excluded.name_snapshot,email_snapshot=excluded.email_snapshot,active=excluded.active;
  get diagnostics affected=row_count; return affected;
end; $$;
grant execute on function public.snapshot_active_employees(uuid) to authenticated;

create or replace function public.validate_campaign_member_location()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.active and not exists (
    select 1 from public.campaigns c join public.employees e on e.id=new.employee_id
    where c.id=new.campaign_id and c.work_location_id=e.work_location_id
  ) then raise exception 'MEMBER_LOCATION_MISMATCH'; end if;
  return new;
end; $$;
drop trigger if exists campaign_member_location_guard on public.campaign_members;
create trigger campaign_member_location_guard before insert or update on public.campaign_members
for each row execute function public.validate_campaign_member_location();

create or replace function public.calculate_campaign_carryover(
  p_start_at timestamptz,
  p_work_location_id uuid,
  p_exclude_campaign_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous_campaign public.campaigns%rowtype; spent numeric(12,2):=0; remaining numeric(12,2):=0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into previous_campaign from public.campaigns
  where work_location_id=p_work_location_id and start_at<p_start_at
    and (p_exclude_campaign_id is null or id<>p_exclude_campaign_id)
  order by start_at desc limit 1;
  if not found then return jsonb_build_object('campaign_id',null,'label',null,'remaining',0,'retained',false); end if;
  if not previous_campaign.retain_unused_budget then
    return jsonb_build_object('campaign_id',previous_campaign.id,'label',previous_campaign.label,'remaining',0,'retained',false);
  end if;
  select coalesce(sum(unit_price*coalesce(final_quantity,suggested_quantity)),0) into spent
  from public.purchase_items where campaign_id=previous_campaign.id;
  remaining:=greatest(previous_campaign.budget-spent,0);
  return jsonb_build_object('campaign_id',previous_campaign.id,'label',previous_campaign.label,'budget',previous_campaign.budget,'spent',spent,'remaining',remaining,'retained',true);
end; $$;
grant execute on function public.calculate_campaign_carryover(timestamptz,uuid,uuid) to authenticated;

create or replace function public.delete_product_category(p_category_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare category_name text; removed_count integer:=0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select name into category_name from public.product_categories where id=p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists (
    select 1 from public.products p
    where p.category=category_name and p.deleted_at is null and exists (
      select 1 from public.campaigns c where c.status='active' and (
        exists(select 1 from public.nominations n where n.campaign_id=c.id and n.product_id=p.id)
        or exists(select 1 from public.votes v where v.campaign_id=c.id and v.product_id=p.id)
      )
    )
  ) then raise exception 'CATEGORY_IN_USE_CURRENT_CAMPAIGN'; end if;
  select count(*)::integer into removed_count from public.products where category=category_name and deleted_at is null;
  update public.products set active=false,deleted_at=now(),updated_at=now() where category=category_name and deleted_at is null;
  delete from public.product_categories where id=p_category_id;
  return removed_count;
end; $$;
grant execute on function public.delete_product_category(uuid) to authenticated;

create or replace function public.delete_work_location(p_location_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if exists(select 1 from public.employees where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_EMPLOYEES'; end if;
  if exists(select 1 from public.campaigns where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_CAMPAIGNS'; end if;
  delete from public.work_locations where id=p_location_id;
end; $$;
grant execute on function public.delete_work_location(uuid) to authenticated;
