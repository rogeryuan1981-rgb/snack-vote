-- Snack Vote / Supabase production schema
-- Run this file once in Supabase > SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------- shared helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- core tables ----------

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_locations_name_unique on public.work_locations(lower(btrim(name)));
insert into public.work_locations(name) values ('主要辦公室') on conflict do nothing;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  email citext not null unique,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  work_location_id uuid not null references public.work_locations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  timezone text not null default 'Asia/Taipei',
  budget numeric(12, 2) not null check (budget >= 0),
  base_budget numeric(12, 2) not null check (base_budget >= 0),
  carryover_enabled boolean not null default false,
  retain_unused_budget boolean not null default false,
  carryover_amount numeric(12, 2) not null default 0 check (carryover_amount >= 0),
  carryover_from uuid references public.campaigns(id) on delete set null,
  work_location_id uuid not null references public.work_locations(id) on delete restrict,
  nomination_limit integer not null default 2 check (nomination_limit > 0),
  vote_limit integer not null default 4 check (vote_limit > 0),
  start_at timestamptz not null,
  nomination_deadline timestamptz not null,
  voting_deadline timestamptz not null,
  purchase_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  purchase_plan_locked_at timestamptz,
  purchase_plan_locked_by uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_stage_order check (
    start_at < nomination_deadline
    and nomination_deadline < voting_deadline
    and voting_deadline <= purchase_at
  ),
  constraint campaigns_limits_order check (vote_limit >= nomination_limit)
  ,constraint campaigns_budget_breakdown_matches check (budget = base_budget + carryover_amount)
);

create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  name_snapshot text not null,
  email_snapshot citext not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campaign_id, employee_id)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_categories_name_unique
on public.product_categories (lower(btrim(name)));

insert into public.product_categories (name, sort_order)
values
  ('洋芋片', 10), ('餅乾', 20), ('巧克力', 30), ('糖果果凍', 40),
  ('米果', 50), ('堅果果乾', 60), ('海苔肉乾', 70), ('飲料', 80)
on conflict do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand text not null default '',
  name text not null check (length(btrim(name)) between 1 and 160),
  category text not null check (length(btrim(category)) between 1 and 80),
  size text not null default '',
  reference_price numeric(10, 2) check (reference_price is null or reference_price >= 0),
  source_url text,
  image_path text,
  origin text not null default 'catalog' check (origin in ('catalog', 'employee')),
  approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_by uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_normalized_identity_unique
on public.products (
  lower(btrim(brand)),
  lower(btrim(name)),
  lower(btrim(size))
)
where active;

create index if not exists products_category_idx
on public.products (category, approval_status, active);

create table if not exists public.nominations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  nominator_name text not null,
  product_name_snapshot text not null,
  price_snapshot numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (campaign_id, employee_id, product_id)
);

create index if not exists nominations_campaign_product_idx
on public.nominations (campaign_id, product_id);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  voter_name text not null,
  kind text not null check (kind in ('nomination', 'regular')),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, employee_id, product_id),
  constraint nomination_vote_must_be_locked check (
    (kind = 'nomination' and locked) or (kind = 'regular' and not locked)
  )
);

create index if not exists votes_campaign_product_idx
on public.votes (campaign_id, product_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_campaign_product_idx
on public.comments (campaign_id, product_id, created_at);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  rank integer not null check (rank > 0),
  vote_count integer not null check (vote_count >= 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  suggested_quantity integer not null check (suggested_quantity >= 0),
  final_quantity integer check (final_quantity is null or final_quantity >= 0),
  purchased boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  stage text not null check (stage in ('nomination', 'voting', 'results', 'reminder')),
  recipient_email citext not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid,
  actor_employee_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_record_idx
on public.audit_logs (table_name, record_id, created_at desc);

-- ---------- identity and authorization helpers ----------

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  where e.user_id = auth.uid() and e.active
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = auth.uid()
      and e.active
      and e.role = 'admin'
  );
$$;

create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.employee_id = public.current_employee_id()
      and cm.active
  );
$$;

grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_campaign_member(uuid) to authenticated;

create or replace function public.is_login_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.employees e
    where e.active and lower(e.email::text)=lower(btrim(p_email))
  );
$$;
revoke all on function public.is_login_email_allowed(text) from public;
grant execute on function public.is_login_email_allowed(text) to anon,authenticated;

create or replace function public.validate_product_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.category := btrim(new.category);
  if new.deleted_at is null and not exists (
    select 1 from public.product_categories c where c.name = new.category
  ) then raise exception 'CATEGORY_NOT_FOUND'; end if;
  return new;
end;
$$;

drop trigger if exists products_validate_category on public.products;
create trigger products_validate_category
before insert or update of category, deleted_at on public.products
for each row execute function public.validate_product_category();

create or replace function public.rename_product_category(p_category_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare old_name text; clean_name text := btrim(p_new_name);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if length(clean_name) < 1 or length(clean_name) > 80 then raise exception 'INVALID_CATEGORY_NAME'; end if;
  select name into old_name from public.product_categories where id = p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists (select 1 from public.product_categories where id <> p_category_id and lower(btrim(name)) = lower(clean_name)) then raise exception 'CATEGORY_ALREADY_EXISTS'; end if;
  update public.product_categories set name = clean_name, updated_at = now() where id = p_category_id;
  update public.products set category = clean_name where category = old_name;
end;
$$;

grant execute on function public.rename_product_category(uuid, text) to authenticated;

create or replace function public.delete_product_category(p_category_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare category_name text; removed_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select name into category_name from public.product_categories where id = p_category_id for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists (
    select 1 from public.products p
    where p.category = category_name and p.deleted_at is null
      and exists (select 1 from public.campaigns c where c.status = 'active' and
        (exists (select 1 from public.nominations n where n.campaign_id = c.id and n.product_id = p.id)
          or exists (select 1 from public.votes v where v.campaign_id = c.id and v.product_id = p.id)))
  ) then raise exception 'CATEGORY_IN_USE_CURRENT_CAMPAIGN'; end if;
  select count(*)::integer into removed_count from public.products where category = category_name and deleted_at is null;
  update public.products set active = false, deleted_at = now(), updated_at = now() where category = category_name and deleted_at is null;
  delete from public.product_categories where id = p_category_id;
  return removed_count;
end;
$$;

grant execute on function public.delete_product_category(uuid) to authenticated;

create or replace function public.calculate_campaign_carryover(p_start_at timestamptz, p_work_location_id uuid, p_exclude_campaign_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous_campaign public.campaigns%rowtype; spent numeric(12,2) := 0; remaining numeric(12,2) := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into previous_campaign from public.campaigns
  where work_location_id = p_work_location_id and start_at < p_start_at
    and (p_exclude_campaign_id is null or id <> p_exclude_campaign_id)
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

grant execute on function public.calculate_campaign_carryover(timestamptz, uuid, uuid) to authenticated;

create or replace function public.link_employee_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.user_id is null then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = lower(new.email::text)
    order by u.created_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_link_auth_before_write on public.employees;
create trigger employees_link_auth_before_write
before insert or update of email on public.employees
for each row execute function public.link_employee_to_auth_user();

create or replace function public.link_auth_user_to_employee()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.employees
  set user_id = new.id, updated_at = now()
  where lower(email::text) = lower(new.email)
    and (user_id is null or user_id = new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_employee on auth.users;
create trigger on_auth_user_created_link_employee
after insert or update of email on auth.users
for each row execute function public.link_auth_user_to_employee();

-- ---------- automatic timestamps and history ----------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employees', 'campaigns', 'products', 'votes', 'comments', 'purchase_items'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.audit_logs (
    table_name, record_id, action, actor_user_id, actor_employee_id, old_data, new_data
  ) values (
    tg_table_name,
    row_id,
    tg_op,
    auth.uid(),
    public.current_employee_id(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employees', 'campaigns', 'campaign_members', 'products', 'nominations',
    'votes', 'comments', 'purchase_items', 'email_deliveries'
  ] loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      table_name, table_name
    );
  end loop;
end $$;

-- ---------- employee actions (atomic, server-enforced rules) ----------

create or replace function public.nominate_product(
  p_campaign_id uuid,
  p_product_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_row public.employees%rowtype;
  campaign_row public.campaigns%rowtype;
  product_row public.products%rowtype;
  nomination_id uuid;
  nomination_count integer;
  vote_count integer;
begin
  select * into employee_row from public.employees
  where id = public.current_employee_id() and active;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into campaign_row from public.campaigns where id = p_campaign_id for update;
  if not found or campaign_row.status <> 'active' then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  if now() < campaign_row.start_at or now() >= campaign_row.nomination_deadline then
    raise exception 'NOMINATION_CLOSED';
  end if;
  if not public.is_campaign_member(p_campaign_id) then raise exception 'NOT_CAMPAIGN_MEMBER'; end if;

  select * into product_row from public.products where id = p_product_id and active;
  if not found or product_row.approval_status = 'rejected' then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if product_row.approval_status = 'pending' and product_row.created_by <> employee_row.id then
    raise exception 'PRODUCT_PENDING_APPROVAL';
  end if;

  if exists (
    select 1 from public.nominations
    where campaign_id = p_campaign_id and employee_id = employee_row.id and product_id = p_product_id
  ) then
    raise exception 'ALREADY_NOMINATED';
  end if;

  select count(*) into nomination_count from public.nominations
  where campaign_id = p_campaign_id and employee_id = employee_row.id;
  if nomination_count >= campaign_row.nomination_limit then raise exception 'NOMINATION_LIMIT_REACHED'; end if;

  select count(*) into vote_count from public.votes
  where campaign_id = p_campaign_id and employee_id = employee_row.id;
  if vote_count >= campaign_row.vote_limit then raise exception 'VOTE_LIMIT_REACHED'; end if;

  insert into public.nominations (
    campaign_id, product_id, employee_id, nominator_name, product_name_snapshot, price_snapshot
  ) values (
    p_campaign_id, p_product_id, employee_row.id, employee_row.name,
    concat_ws(' ', nullif(product_row.brand, ''), product_row.name, nullif(product_row.size, '')),
    product_row.reference_price
  ) returning id into nomination_id;

  insert into public.votes (
    campaign_id, product_id, employee_id, voter_name, kind, locked
  ) values (
    p_campaign_id, p_product_id, employee_row.id, employee_row.name, 'nomination', true
  );

  return nomination_id;
end;
$$;

create or replace function public.add_custom_product_and_nominate(
  p_campaign_id uuid,
  p_name text,
  p_category text,
  p_brand text default '',
  p_size text default '',
  p_reference_price numeric default null,
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_id uuid := public.current_employee_id();
  product_id uuid;
begin
  if employee_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  if length(btrim(p_name)) = 0 or length(btrim(p_category)) = 0 then raise exception 'INVALID_PRODUCT'; end if;

  select p.id into product_id
  from public.products p
  where p.active
    and lower(btrim(p.brand)) = lower(btrim(coalesce(p_brand, '')))
    and lower(btrim(p.name)) = lower(btrim(p_name))
    and lower(btrim(p.size)) = lower(btrim(coalesce(p_size, '')))
  limit 1;

  if product_id is not null then raise exception 'DUPLICATE_PRODUCT:%', product_id; end if;

  insert into public.products (
    brand, name, category, size, reference_price, source_url,
    origin, approval_status, created_by
  ) values (
    btrim(coalesce(p_brand, '')), btrim(p_name), btrim(p_category), btrim(coalesce(p_size, '')),
    p_reference_price, nullif(btrim(coalesce(p_source_url, '')), ''),
    'employee', 'pending', employee_id
  ) returning id into product_id;

  perform public.nominate_product(p_campaign_id, product_id);
  return product_id;
end;
$$;

create or replace function public.set_regular_votes(
  p_campaign_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_row public.employees%rowtype;
  campaign_row public.campaigns%rowtype;
  normalized_ids uuid[];
  fixed_count integer;
  requested_count integer;
  invalid_count integer;
begin
  select * into employee_row from public.employees
  where id = public.current_employee_id() and active;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into campaign_row from public.campaigns where id = p_campaign_id for update;
  if not found or campaign_row.status <> 'active' then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  if now() < campaign_row.nomination_deadline or now() >= campaign_row.voting_deadline then
    raise exception 'VOTING_CLOSED';
  end if;
  if not public.is_campaign_member(p_campaign_id) then raise exception 'NOT_CAMPAIGN_MEMBER'; end if;

  select coalesce(array_agg(distinct value), array[]::uuid[])
  into normalized_ids
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as value;
  requested_count := cardinality(normalized_ids);

  select count(*) into fixed_count from public.votes
  where campaign_id = p_campaign_id and employee_id = employee_row.id and kind = 'nomination';
  if fixed_count + requested_count > campaign_row.vote_limit then raise exception 'VOTE_LIMIT_REACHED'; end if;

  select count(*) into invalid_count
  from unnest(normalized_ids) x(product_id)
  where not exists (
    select 1 from public.nominations n
    where n.campaign_id = p_campaign_id and n.product_id = x.product_id
  ) or exists (
    select 1 from public.votes v
    where v.campaign_id = p_campaign_id
      and v.employee_id = employee_row.id
      and v.product_id = x.product_id
      and v.kind = 'nomination'
  );
  if invalid_count > 0 then raise exception 'INVALID_VOTE_SELECTION'; end if;

  delete from public.votes
  where campaign_id = p_campaign_id and employee_id = employee_row.id and kind = 'regular';

  insert into public.votes (campaign_id, product_id, employee_id, voter_name, kind, locked)
  select p_campaign_id, product_id, employee_row.id, employee_row.name, 'regular', false
  from unnest(normalized_ids) x(product_id);
end;
$$;

create or replace function public.set_nominations(
  p_campaign_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_row public.employees%rowtype;
  campaign_row public.campaigns%rowtype;
  normalized_ids uuid[];
  requested_count integer;
  invalid_count integer;
  regular_vote_count integer;
begin
  select * into employee_row from public.employees
  where id = public.current_employee_id() and active;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into campaign_row from public.campaigns where id = p_campaign_id for update;
  if not found or campaign_row.status <> 'active' then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  if now() < campaign_row.start_at or now() >= campaign_row.nomination_deadline then
    raise exception 'NOMINATION_CLOSED';
  end if;
  if not public.is_campaign_member(p_campaign_id) then raise exception 'NOT_CAMPAIGN_MEMBER'; end if;

  select coalesce(array_agg(distinct value), array[]::uuid[])
  into normalized_ids
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as value;
  requested_count := cardinality(normalized_ids);

  if requested_count > campaign_row.nomination_limit then raise exception 'NOMINATION_LIMIT_REACHED'; end if;

  select count(*) into regular_vote_count from public.votes
  where campaign_id = p_campaign_id and employee_id = employee_row.id and kind = 'regular';
  if regular_vote_count + requested_count > campaign_row.vote_limit then raise exception 'VOTE_LIMIT_REACHED'; end if;

  select count(*) into invalid_count
  from unnest(normalized_ids) x(product_id)
  where not exists (
    select 1 from public.products p
    where p.id = x.product_id
      and p.active
      and p.approval_status <> 'rejected'
      and (p.approval_status = 'approved' or p.created_by = employee_row.id)
  );
  if invalid_count > 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  -- Remove only nominations no longer selected. Their mandatory votes move with them.
  delete from public.votes v
  where v.campaign_id = p_campaign_id
    and v.employee_id = employee_row.id
    and v.kind = 'nomination'
    and not (v.product_id = any(normalized_ids));

  delete from public.nominations n
  where n.campaign_id = p_campaign_id
    and n.employee_id = employee_row.id
    and not (n.product_id = any(normalized_ids));

  insert into public.nominations (
    campaign_id, product_id, employee_id, nominator_name, product_name_snapshot, price_snapshot
  )
  select
    p_campaign_id,
    p.id,
    employee_row.id,
    employee_row.name,
    concat_ws(' ', nullif(p.brand, ''), p.name, nullif(p.size, '')),
    p.reference_price
  from public.products p
  where p.id = any(normalized_ids)
  on conflict (campaign_id, employee_id, product_id) do nothing;

  insert into public.votes (
    campaign_id, product_id, employee_id, voter_name, kind, locked
  )
  select p_campaign_id, product_id, employee_row.id, employee_row.name, 'nomination', true
  from unnest(normalized_ids) x(product_id)
  on conflict (campaign_id, employee_id, product_id) do nothing;
end;
$$;

grant execute on function public.nominate_product(uuid, uuid) to authenticated;
grant execute on function public.add_custom_product_and_nominate(uuid, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.set_nominations(uuid, uuid[]) to authenticated;
grant execute on function public.set_regular_votes(uuid, uuid[]) to authenticated;

-- ---------- read models ----------

create or replace view public.campaign_vote_totals
with (security_invoker = true)
as
select
  v.campaign_id,
  v.product_id,
  count(*)::integer as vote_count,
  array_agg(v.voter_name order by v.created_at) as voter_names
from public.votes v
group by v.campaign_id, v.product_id;

create or replace view public.campaign_nomination_totals
with (security_invoker = true)
as
select
  n.campaign_id,
  n.product_id,
  count(*)::integer as nomination_count,
  array_agg(n.nominator_name order by n.created_at) as nominator_names
from public.nominations n
group by n.campaign_id, n.product_id;

grant select on public.campaign_vote_totals to authenticated;
grant select on public.campaign_nomination_totals to authenticated;

-- ---------- row-level security ----------

alter table public.employees enable row level security;
alter table public.work_locations enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.nominations enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.purchase_items enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.audit_logs enable row level security;

-- Employees: a staff member can see their own account; admins manage the roster.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists employees_admin_insert on public.employees;
create policy employees_admin_insert on public.employees for insert to authenticated
with check (public.is_admin());
drop policy if exists employees_admin_update on public.employees;
create policy employees_admin_update on public.employees for update to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists employees_admin_delete on public.employees;
create policy employees_admin_delete on public.employees for delete to authenticated
using (public.is_admin());

drop policy if exists work_locations_select on public.work_locations;
create policy work_locations_select on public.work_locations for select to authenticated using (true);
drop policy if exists work_locations_admin_all on public.work_locations;
create policy work_locations_admin_all on public.work_locations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
using (public.is_admin() or (status <> 'draft' and public.is_campaign_member(id)));
drop policy if exists campaigns_admin_all on public.campaigns;
create policy campaigns_admin_all on public.campaigns for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists campaign_members_select on public.campaign_members;
create policy campaign_members_select on public.campaign_members for select to authenticated
using (public.is_admin() or employee_id = public.current_employee_id());
drop policy if exists campaign_members_admin_all on public.campaign_members;
create policy campaign_members_admin_all on public.campaign_members for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories for select to authenticated
using (true);
drop policy if exists product_categories_admin_all on public.product_categories;
create policy product_categories_admin_all on public.product_categories for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
using (
  public.is_admin()
  or (active and approval_status = 'approved')
  or created_by = public.current_employee_id()
  or exists (
    select 1 from public.nominations n
    where n.product_id = products.id and public.is_campaign_member(n.campaign_id)
  )
);
drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists nominations_select on public.nominations;
create policy nominations_select on public.nominations for select to authenticated
using (public.is_campaign_member(campaign_id));
drop policy if exists nominations_admin_all on public.nominations;
create policy nominations_admin_all on public.nominations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes for select to authenticated
using (public.is_campaign_member(campaign_id));
drop policy if exists votes_admin_all on public.votes;
create policy votes_admin_all on public.votes for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
using (public.is_campaign_member(campaign_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
with check (
  employee_id = public.current_employee_id()
  and author_name = (select e.name from public.employees e where e.id = public.current_employee_id())
  and public.is_campaign_member(campaign_id)
  and exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.status = 'active'
      and now() >= c.start_at and now() < c.voting_deadline
  )
);
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
using (employee_id = public.current_employee_id() or public.is_admin())
with check (employee_id = public.current_employee_id() or public.is_admin());
drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete on public.comments for delete to authenticated
using (public.is_admin());

drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items for select to authenticated
using (
  public.is_admin() or (
    public.is_campaign_member(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and now() >= c.voting_deadline)
  )
);
drop policy if exists purchase_items_admin_all on public.purchase_items;
create policy purchase_items_admin_all on public.purchase_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists email_deliveries_admin_all on public.email_deliveries;
create policy email_deliveries_admin_all on public.email_deliveries for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
using (public.is_admin());

-- No direct employee writes to nominations or votes. Employees use the atomic RPCs above.
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.work_locations, public.employees, public.campaigns, public.campaign_members,
  public.product_categories, public.products, public.nominations, public.votes, public.comments,
  public.purchase_items, public.email_deliveries to authenticated;
grant insert, update, delete on public.work_locations, public.employees, public.campaigns, public.campaign_members,
  public.product_categories, public.products, public.nominations, public.votes, public.comments,
  public.purchase_items, public.email_deliveries to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- realtime ----------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'campaigns', 'products', 'nominations', 'votes', 'comments', 'purchase_items'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- ---------- admin convenience functions ----------

create or replace function public.snapshot_active_employees(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer; campaign_location uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select work_location_id into campaign_location from public.campaigns where id=p_campaign_id;
  if campaign_location is null then raise exception 'CAMPAIGN_LOCATION_REQUIRED'; end if;
  update public.campaign_members set active=false where campaign_id=p_campaign_id;
  insert into public.campaign_members (campaign_id, employee_id, name_snapshot, email_snapshot, active)
  select p_campaign_id, e.id, e.name, e.email, true
  from public.employees e
  where e.active and e.work_location_id=campaign_location
  on conflict (campaign_id, employee_id) do update
  set name_snapshot = excluded.name_snapshot,
      email_snapshot = excluded.email_snapshot,
      active = excluded.active;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

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

create or replace function public.delete_work_location(p_location_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if exists(select 1 from public.employees where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_EMPLOYEES'; end if;
  if exists(select 1 from public.campaigns where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_CAMPAIGNS'; end if;
  delete from public.work_locations where id=p_location_id;
end; $$;
grant execute on function public.delete_work_location(uuid) to authenticated;

create or replace function public.force_delete_campaign(
  p_campaign_id uuid,
  p_expected_label text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare campaign_label text; nomination_count integer; vote_count integer; comment_count integer; purchase_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select label into campaign_label from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if campaign_label<>p_expected_label then raise exception 'CAMPAIGN_LABEL_MISMATCH'; end if;
  select count(*)::integer into nomination_count from public.nominations where campaign_id=p_campaign_id;
  select count(*)::integer into vote_count from public.votes where campaign_id=p_campaign_id;
  select count(*)::integer into comment_count from public.comments where campaign_id=p_campaign_id;
  select count(*)::integer into purchase_count from public.purchase_items where campaign_id=p_campaign_id;
  delete from public.campaigns where id=p_campaign_id;
  return jsonb_build_object('campaign_id',p_campaign_id,'label',campaign_label,'nominations',nomination_count,'votes',vote_count,'comments',comment_count,'purchase_items',purchase_count);
end; $$;
revoke all on function public.force_delete_campaign(uuid,text) from public,anon;
grant execute on function public.force_delete_campaign(uuid,text) to authenticated;

-- Bootstrap note:
-- After this script succeeds, run the following separately with your real details:
-- insert into public.employees (name, email, role, work_location_id)
-- select '管理者姓名', 'your-company-email@example.com', 'admin', id
-- from public.work_locations order by created_at limit 1;
