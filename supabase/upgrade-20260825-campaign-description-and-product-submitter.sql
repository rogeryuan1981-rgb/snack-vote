-- Activity description + product submitter display support.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists description text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_description_length'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_description_length
      check (char_length(description) <= 1000);
  end if;
end;
$$;

-- New employee-created products already save products.created_by.
-- Backfill older rows where possible from the first nomination record.
with first_nominator as (
  select distinct on (n.product_id)
    n.product_id,
    n.employee_id
  from public.nominations n
  join public.products p on p.id = n.product_id
  where p.origin = 'employee'
    and p.created_by is null
  order by n.product_id, n.created_at asc
)
update public.products p
set created_by = f.employee_id
from first_nominator f
where p.id = f.product_id
  and p.created_by is null;

notify pgrst, 'reload schema';
