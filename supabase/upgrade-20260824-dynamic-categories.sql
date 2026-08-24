-- Snack Vote 增量升級：可維護商品類別 + 安全刪除
-- 刪除類別會讓相關商品離開商品庫，但保留歷史期別所需的商品紀錄。

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_categories_name_unique
on public.product_categories (lower(btrim(name)));

alter table public.products
add column if not exists deleted_at timestamptz;

insert into public.product_categories (name, sort_order)
select category, row_number() over (order by category)::integer
from (
  select distinct btrim(category) as category
  from public.products
  where btrim(category) <> ''
) existing
on conflict do nothing;

insert into public.product_categories (name, sort_order)
values
  ('洋芋片', 10), ('餅乾', 20), ('巧克力', 30), ('糖果果凍', 40),
  ('米果', 50), ('堅果果乾', 60), ('海苔肉乾', 70), ('飲料', 80)
on conflict do nothing;

alter table public.product_categories enable row level security;

drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories
for select to authenticated using (true);

drop policy if exists product_categories_admin_all on public.product_categories;
create policy product_categories_admin_all on public.product_categories
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.product_categories to authenticated;

create or replace function public.validate_product_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.category := btrim(new.category);
  if new.deleted_at is null and not exists (
    select 1 from public.product_categories c where c.name = new.category
  ) then
    raise exception 'CATEGORY_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists products_validate_category on public.products;
create trigger products_validate_category
before insert or update of category, deleted_at on public.products
for each row execute function public.validate_product_category();

create or replace function public.rename_product_category(
  p_category_id uuid,
  p_new_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_name text;
  clean_name text := btrim(p_new_name);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if length(clean_name) < 1 or length(clean_name) > 80 then raise exception 'INVALID_CATEGORY_NAME'; end if;

  select name into old_name
  from public.product_categories
  where id = p_category_id
  for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;

  if exists (
    select 1 from public.product_categories
    where id <> p_category_id and lower(btrim(name)) = lower(clean_name)
  ) then raise exception 'CATEGORY_ALREADY_EXISTS'; end if;

  update public.product_categories
  set name = clean_name, updated_at = now()
  where id = p_category_id;

  update public.products
  set category = clean_name
  where category = old_name;
end;
$$;

grant execute on function public.rename_product_category(uuid, text) to authenticated;

create or replace function public.delete_product_category(p_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  category_name text;
  current_campaign_id uuid;
  removed_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select name into category_name
  from public.product_categories
  where id = p_category_id
  for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;

  select id into current_campaign_id
  from public.campaigns
  where status = 'active'
  order by start_at desc
  limit 1;

  if current_campaign_id is not null and exists (
    select 1
    from public.products p
    where p.category = category_name
      and p.deleted_at is null
      and (
        exists (select 1 from public.nominations n where n.campaign_id = current_campaign_id and n.product_id = p.id)
        or exists (select 1 from public.votes v where v.campaign_id = current_campaign_id and v.product_id = p.id)
      )
  ) then
    raise exception 'CATEGORY_IN_USE_CURRENT_CAMPAIGN';
  end if;

  select count(*)::integer into removed_count
  from public.products
  where category = category_name and deleted_at is null;

  update public.products
  set active = false, deleted_at = now(), updated_at = now()
  where category = category_name and deleted_at is null;

  delete from public.product_categories where id = p_category_id;
  return removed_count;
end;
$$;

grant execute on function public.delete_product_category(uuid) to authenticated;

