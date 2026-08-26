-- Snack Vote / FINAL DATABASE SETUP
-- Generated: 2026-08-25
-- This is the only SQL file that should be executed in Supabase SQL Editor.
-- Safe for the current production database and for a new empty project.
-- Sections are intentionally ordered and idempotent; rerunning applies missing updates.

-- ============================================================================
-- SOURCE: supabase\schema.sql
-- ============================================================================

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
insert into public.work_locations(name) values ('專案辦公室') on conflict do nothing;

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
  purchase_plan_generated_at timestamptz,
  purchase_expected_arrival_date date,
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
  ('堅果', 10), ('巧克力', 20), ('洋芋片', 30), ('米果', 40),
  ('糖果', 50), ('餅乾', 60), ('海苔肉乾', 70)
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

create table if not exists public.product_reactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reactor_name text not null,
  reaction smallint not null check (reaction in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, employee_id)
);

create index if not exists product_reactions_product_reaction_idx
on public.product_reactions (product_id, reaction, created_at);

create table if not exists public.purchase_reviews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, product_id, employee_id)
);

create index if not exists purchase_reviews_campaign_product_idx
on public.purchase_reviews (campaign_id, product_id, created_at);

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  author_name text not null,
  category text not null default 'other' check (category in ('usability', 'nomination', 'voting', 'results_purchase', 'catalog', 'other')),
  nomination_rating integer not null check (nomination_rating between 1 and 5),
  voting_rating integer not null check (voting_rating between 1 and 5),
  results_rating integer not null check (results_rating between 1 and 5),
  body text not null check (length(btrim(body)) between 5 and 1000),
  status text not null default 'unread' check (status in ('unread', 'read', 'replied', 'closed')),
  read_at timestamptz,
  admin_reply text check (admin_reply is null or length(btrim(admin_reply)) between 1 and 2000),
  replied_at timestamptz,
  replied_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_submissions_status_created_idx
on public.feedback_submissions (status, created_at desc);

create index if not exists feedback_submissions_employee_created_idx
on public.feedback_submissions (employee_id, created_at desc);

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
    'employees', 'campaigns', 'products', 'votes', 'comments', 'product_reactions', 'purchase_reviews', 'feedback_submissions', 'purchase_items'
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
    'votes', 'comments', 'product_reactions', 'purchase_reviews', 'feedback_submissions', 'purchase_items', 'email_deliveries'
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
  assigned_location_count integer := 0;
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

  -- A product submitted from an activity belongs to that activity's locations.
  -- Employees do not choose locations themselves; an administrator may adjust
  -- these inherited locations while the product is pending review.
  insert into public.product_work_locations (product_id, work_location_id)
  select product_id, cwl.work_location_id
  from public.campaign_work_locations cwl
  where cwl.campaign_id = p_campaign_id
  on conflict do nothing;

  get diagnostics assigned_location_count = row_count;

  -- Compatibility for campaigns created before multi-location support.
  if assigned_location_count = 0 then
    insert into public.product_work_locations (product_id, work_location_id)
    select product_id, c.work_location_id
    from public.campaigns c
    where c.id = p_campaign_id
      and c.work_location_id is not null
    on conflict do nothing;

    get diagnostics assigned_location_count = row_count;
  end if;

  if assigned_location_count = 0 then
    raise exception 'CAMPAIGN_LOCATION_REQUIRED';
  end if;

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
alter table public.product_reactions enable row level security;
alter table public.purchase_reviews enable row level security;
alter table public.feedback_submissions enable row level security;
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

drop policy if exists product_reactions_select on public.product_reactions;
create policy product_reactions_select on public.product_reactions for select to authenticated
using (true);
drop policy if exists product_reactions_insert on public.product_reactions;
create policy product_reactions_insert on public.product_reactions for insert to authenticated
with check (
  employee_id = public.current_employee_id()
  and reactor_name = (select e.name from public.employees e where e.id = public.current_employee_id())
);
drop policy if exists product_reactions_update on public.product_reactions;
create policy product_reactions_update on public.product_reactions for update to authenticated
using (employee_id = public.current_employee_id())
with check (
  employee_id = public.current_employee_id()
  and reactor_name = (select e.name from public.employees e where e.id = public.current_employee_id())
);
drop policy if exists product_reactions_delete on public.product_reactions;
create policy product_reactions_delete on public.product_reactions for delete to authenticated
using (employee_id = public.current_employee_id() or public.is_admin());

drop policy if exists purchase_reviews_select on public.purchase_reviews;
create policy purchase_reviews_select on public.purchase_reviews for select to authenticated
using (public.is_campaign_member(campaign_id));
drop policy if exists purchase_reviews_insert on public.purchase_reviews;
create policy purchase_reviews_insert on public.purchase_reviews for insert to authenticated
with check (
  employee_id = public.current_employee_id()
  and author_name = (select e.name from public.employees e where e.id = public.current_employee_id())
  and public.is_campaign_member(campaign_id)
  and exists (
    select 1 from public.purchase_items pi
    where pi.campaign_id = purchase_reviews.campaign_id
      and pi.product_id = purchase_reviews.product_id
      and pi.purchased
      and coalesce(pi.final_quantity, pi.suggested_quantity) > 0
  )
);
drop policy if exists purchase_reviews_update on public.purchase_reviews;
create policy purchase_reviews_update on public.purchase_reviews for update to authenticated
using (employee_id = public.current_employee_id() or public.is_admin())
with check (
  (employee_id = public.current_employee_id() or public.is_admin())
  and exists (
    select 1 from public.purchase_items pi
    where pi.campaign_id = purchase_reviews.campaign_id
      and pi.product_id = purchase_reviews.product_id
      and pi.purchased
      and coalesce(pi.final_quantity, pi.suggested_quantity) > 0
  )
);
drop policy if exists purchase_reviews_delete on public.purchase_reviews;
create policy purchase_reviews_delete on public.purchase_reviews for delete to authenticated
using (employee_id = public.current_employee_id() or public.is_admin());

drop policy if exists feedback_submissions_select on public.feedback_submissions;
create policy feedback_submissions_select on public.feedback_submissions for select to authenticated
using (employee_id = public.current_employee_id() or public.is_admin());
drop policy if exists feedback_submissions_insert on public.feedback_submissions;
create policy feedback_submissions_insert on public.feedback_submissions for insert to authenticated
with check (
  employee_id = public.current_employee_id()
  and author_name = (select e.name from public.employees e where e.id = public.current_employee_id())
  and status = 'unread'
  and read_at is null
  and admin_reply is null
  and replied_at is null
  and replied_by is null
);
drop policy if exists feedback_submissions_admin_update on public.feedback_submissions;
create policy feedback_submissions_admin_update on public.feedback_submissions for update to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists feedback_submissions_admin_delete on public.feedback_submissions;
create policy feedback_submissions_admin_delete on public.feedback_submissions for delete to authenticated
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
  public.product_categories, public.products, public.nominations, public.votes, public.comments, public.product_reactions,
  public.purchase_reviews, public.feedback_submissions, public.purchase_items, public.email_deliveries to authenticated;
grant insert, update, delete on public.work_locations, public.employees, public.campaigns, public.campaign_members,
  public.product_categories, public.products, public.nominations, public.votes, public.comments, public.product_reactions,
  public.purchase_reviews, public.feedback_submissions, public.purchase_items, public.email_deliveries to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- realtime ----------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'campaigns', 'products', 'nominations', 'votes', 'comments', 'product_reactions', 'purchase_reviews', 'feedback_submissions', 'purchase_items'
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
-- from public.work_locations where name='專案辦公室' order by created_at limit 1;


-- ============================================================================
-- SOURCE: supabase\upgrade-20260820-product-images-and-review.sql
-- ============================================================================

-- Snack Vote 增量升級：商品圖片 + 退回待審商品時返還提名與固定票
-- 已執行過完整 schema.sql 的既有專案，只需再執行本檔一次。

alter table public.products
add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects for select
to public
using (bucket_id = 'product-images');

drop policy if exists product_images_employee_insert on storage.objects;
create policy product_images_employee_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_employee_id()::text
  )
);

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_employee_id()::text
  )
)
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_employee_id()::text
  )
);

drop policy if exists product_images_owner_delete on storage.objects;
create policy product_images_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_employee_id()::text
  )
);

create or replace function public.review_product(
  p_product_id uuid,
  p_decision text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  refunded_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'INVALID_DECISION'; end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id and approval_status = 'pending'
  ) then
    raise exception 'PRODUCT_NOT_PENDING';
  end if;

  if p_decision = 'approved' then
    if not exists (
      select 1 from public.product_work_locations
      where product_id = p_product_id
    ) then
      raise exception 'PRODUCT_LOCATION_REQUIRED';
    end if;

    update public.products
    set approval_status = 'approved', active = true
    where id = p_product_id;
    return 0;
  end if;

  select count(*)::integer into refunded_count
  from public.nominations
  where product_id = p_product_id;

  delete from public.votes
  where product_id = p_product_id and kind = 'nomination';

  delete from public.nominations
  where product_id = p_product_id;

  update public.products
  set approval_status = 'rejected', active = false
  where id = p_product_id;

  return refunded_count;
end;
$$;

grant execute on function public.review_product(uuid, text) to authenticated;

create or replace function public.set_product_image(
  p_product_id uuid,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not exists (
    select 1 from public.products
    where id = p_product_id
      and created_by = public.current_employee_id()
      and approval_status = 'pending'
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.products
  set image_path = nullif(btrim(p_image_path), '')
  where id = p_product_id;
end;
$$;

grant execute on function public.set_product_image(uuid, text) to authenticated;

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
      rank() over (
        order by count(*) desc
      )::integer as rank
    from public.votes v
    where v.campaign_id = p_campaign_id
    group by v.product_id
  ) ranked
  join public.products p on p.id = ranked.product_id
  where ranked.rank <= 5
  order by ranked.rank, ranked.product_id;

  -- 第一輪：依名次先讓每個品項最多取得 2 份。
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

  -- 第二輪：再由第 1 名到第 5 名逐輪補 1 份，直到餘額買不起任何品項。
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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-dynamic-categories.sql
-- ============================================================================

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

-- Normalize the two legacy default names. Arbitrary product values are no
-- longer imported as categories here; additional categories must be created
-- deliberately by an administrator.
update public.products set category='糖果' where btrim(category)='糖果果凍';
update public.products set category='堅果' where btrim(category)='堅果果乾';
delete from public.product_categories where btrim(name) in ('糖果果凍','堅果果乾');

insert into public.product_categories (name, sort_order)
values
  ('堅果', 10), ('巧克力', 20), ('洋芋片', 30), ('米果', 40),
  ('糖果', 50), ('餅乾', 60), ('海苔肉乾', 70)
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



-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-budget-rollover.sql
-- ============================================================================

-- Snack Vote 增量升級：每期基本預算與上期餘額結轉

alter table public.campaigns add column if not exists base_budget numeric(12,2);
alter table public.campaigns add column if not exists carryover_enabled boolean not null default false;
alter table public.campaigns add column if not exists retain_unused_budget boolean not null default false;
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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-budget-retention.sql
-- ============================================================================

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



-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-work-locations.sql
-- ============================================================================

-- Snack Vote 增量升級：上班地點、分地點活動與歷史活動維護基礎

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_locations_name_unique on public.work_locations(lower(btrim(name)));

insert into public.work_locations(name) values ('專案辦公室') on conflict do nothing;

alter table public.employees add column if not exists work_location_id uuid references public.work_locations(id) on delete restrict;
alter table public.campaigns add column if not exists work_location_id uuid references public.work_locations(id) on delete restrict;

update public.employees set work_location_id=(select id from public.work_locations where name='專案辦公室' order by created_at limit 1) where work_location_id is null;
update public.campaigns set work_location_id=(select id from public.work_locations where name='專案辦公室' order by created_at limit 1) where work_location_id is null;
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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-force-delete-campaign.sql
-- ============================================================================

-- Snack Vote 增量升級：管理者可永久刪除測試活動及其關聯資料

create or replace function public.force_delete_campaign(
  p_campaign_id uuid,
  p_expected_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_label text;
  nomination_count integer;
  vote_count integer;
  comment_count integer;
  purchase_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select label into campaign_label
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if campaign_label <> p_expected_label then raise exception 'CAMPAIGN_LABEL_MISMATCH'; end if;

  select count(*)::integer into nomination_count from public.nominations where campaign_id = p_campaign_id;
  select count(*)::integer into vote_count from public.votes where campaign_id = p_campaign_id;
  select count(*)::integer into comment_count from public.comments where campaign_id = p_campaign_id;
  select count(*)::integer into purchase_count from public.purchase_items where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;

  return jsonb_build_object(
    'campaign_id', p_campaign_id,
    'label', campaign_label,
    'nominations', nomination_count,
    'votes', vote_count,
    'comments', comment_count,
    'purchase_items', purchase_count
  );
end;
$$;

revoke all on function public.force_delete_campaign(uuid, text) from public, anon;
grant execute on function public.force_delete_campaign(uuid, text) to authenticated;


-- ============================================================================
-- SOURCE: supabase\upgrade-20260824-login-security.sql
-- ============================================================================

-- Snack Vote 增量升級：登入寄信前檢查啟用員工名單

create or replace function public.is_login_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.active
      and lower(e.email::text) = lower(btrim(p_email))
  );
$$;

revoke all on function public.is_login_email_allowed(text) from public;
grant execute on function public.is_login_email_allowed(text) to anon, authenticated;


-- ============================================================================
-- SOURCE: supabase\upgrade-20260825-campaign-description-and-product-submitter.sql
-- ============================================================================

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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260825-competition-ranking.sql
-- ============================================================================

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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260825-purchase-plan-locking.sql
-- ============================================================================

-- Stable purchase editing, price-preserving recalculation, and purchase-plan locking.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists purchase_plan_locked_at timestamptz;

alter table public.campaigns
  add column if not exists purchase_plan_locked_by uuid
  references public.employees(id) on delete set null;

alter table public.campaigns
  add column if not exists purchase_expected_arrival_date date;

alter table public.campaigns
  add column if not exists purchase_plan_generated_at timestamptz;

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
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

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


-- ============================================================================
-- SOURCE: supabase\upgrade-20260825-purchase-arrival-and-employee-summary.sql
-- ============================================================================

-- Expected arrival date and employee-facing locked purchase summary.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists purchase_expected_arrival_date date;

notify pgrst, 'reload schema';


-- ============================================================================
-- SOURCE: supabase\upgrade-20260825-live-unlocked-purchase-plan.sql
-- ============================================================================

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


-- ============================================================================
-- SOURCE: supabase\seed-products.sql
-- ============================================================================

-- Snack Vote 基礎商品庫
-- 可重複執行：相同品牌、名稱、規格的啟用商品不會再次新增。
-- 價格刻意留空，請管理者採購前依實際門市售價補充。

with seed(brand, name, category, size, source_url) as (
  values
    ('樂事', '美國經典原味洋芋片', '洋芋片', '約 90g', null),
    ('樂事', '九州岩燒海苔洋芋片', '洋芋片', '約 90g', null),
    ('華元', '波的多洋芋片－蚵仔煎口味', '洋芋片', '約 70g', null),
    ('華元', '波的多洋芋片－皮蛋豆腐風味', '洋芋片', '73g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),
    ('卡迪那', '小德薯－濃厚茄汁口味', '洋芋片', '36g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),

    ('義美', '小泡芙－牛奶口味', '餅乾', '約 57g', null),
    ('義美', '夾心酥－檸檬口味', '餅乾', '約 152g', null),
    ('奧利奧', '巧克力夾心餅乾', '餅乾', '約 119.6g', null),
    ('麗滋', '原味餅乾', '餅乾', '約 100g', null),
    ('可樂果', 'Mini豌豆酥－香脆麵口味', '餅乾', '50g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),

    ('義美', '葡萄QQ糖巧克球', '巧克力', '50g', 'https://pxbox.es.pxmart.com.tw/product/532308'),
    ('義美', '草莓QQ糖白巧克球', '巧克力', '50g', 'https://pxbox.es.pxmart.com.tw/product/551821'),
    ('義美', '黑可可杏仁巧克球', '巧克力', '47g', 'https://pxbox.es.pxmart.com.tw/product/358897'),
    ('明治', '夏威夷豆可可粒', '巧克力', '64g', 'https://pxbox.es.pxmart.com.tw/product/196490'),
    ('健達', '繽紛樂巧克力', '巧克力', '單條裝', null),

    ('義美', '知心水果軟糖－草莓風味', '糖果', '94.5g', 'https://pxbox.es.pxmart.com.tw/product/357922'),
    ('森永', '嗨啾軟糖－綜合水果', '糖果', '約 100g', null),
    ('哈瑞寶', '金熊Q軟糖', '糖果', '約 100g', null),
    ('盛香珍', 'Dr.Q蒟蒻果凍－綜合水果', '糖果', '約 265g', null),
    ('曼陀珠', '綜合水果軟糖', '糖果', '分享包', null),

    ('旺旺', '仙貝', '米果', '分享包', null),
    ('旺旺', '雪餅', '米果', '分享包', null),
    ('北田', '蒟蒻糙米捲－蛋黃口味', '米果', '約 160g', null),
    ('喜年來', '蛋捲', '米果', '約 192g', null),
    ('義美', '糙米米果', '米果', '分享包', null),

    ('萬歲牌', '無調味綜合堅果', '堅果', '約 170g', null),
    ('萬歲牌', '蜜汁腰果', '堅果', '約 160g', null),
    ('盛香珍', '蒜香青豆', '堅果', '約 240g', null),
    ('味彩', '綜合豆果子', '堅果', '360g（24g×15包）', 'https://pxbox.es.pxmart.com.tw/product/431986'),
    ('每日優果', '綜合堅果', '堅果', '隨手包', null),

    ('元本山', '味付海苔', '海苔肉乾', '分享包', null),
    ('小老板', '厚片海苔－原味', '海苔肉乾', '分享包', null),
    ('新東陽', '蜜汁豬肉乾', '海苔肉乾', '約 100g', null),
    ('快車肉乾', '特厚蜜汁豬肉乾', '海苔肉乾', '分享包', null),
    ('良澔', '片烤海苔－椒鹽口味', '海苔肉乾', '分享包', null)
)
insert into public.products (
  brand, name, category, size, reference_price, source_url,
  origin, approval_status, active
)
select
  s.brand, s.name, s.category, s.size, null, s.source_url,
  'catalog', 'approved', true
from seed s
where not exists (
  select 1
  from public.products p
  where p.active
    and lower(btrim(p.brand)) = lower(btrim(s.brand))
    and lower(btrim(p.name)) = lower(btrim(s.name))
    and lower(btrim(p.size)) = lower(btrim(s.size))
);

select category, count(*) as product_count
from public.products
where active and approval_status = 'approved'
group by category
order by category;

-- ---------- multi-location model (employees, campaigns, products) ----------

create table if not exists public.employee_work_locations (
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_location_id uuid not null references public.work_locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (employee_id, work_location_id)
);

create table if not exists public.campaign_work_locations (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  work_location_id uuid not null references public.work_locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campaign_id, work_location_id)
);

create table if not exists public.product_work_locations (
  product_id uuid not null references public.products(id) on delete cascade,
  work_location_id uuid not null references public.work_locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, work_location_id)
);

insert into public.employee_work_locations(employee_id, work_location_id)
select id, work_location_id from public.employees e
where work_location_id is not null
  and not exists (select 1 from public.employee_work_locations x where x.employee_id=e.id)
on conflict do nothing;

insert into public.campaign_work_locations(campaign_id, work_location_id)
select id, work_location_id from public.campaigns c
where work_location_id is not null
  and not exists (select 1 from public.campaign_work_locations x where x.campaign_id=c.id)
on conflict do nothing;

-- All existing products default to the project office only.
insert into public.product_work_locations(product_id, work_location_id)
select p.id, l.id from public.products p
join public.work_locations l on l.name='專案辦公室'
where not exists (select 1 from public.product_work_locations x where x.product_id=p.id)
on conflict do nothing;

alter table public.employee_work_locations enable row level security;
alter table public.campaign_work_locations enable row level security;
alter table public.product_work_locations enable row level security;

drop policy if exists employee_work_locations_select on public.employee_work_locations;
create policy employee_work_locations_select on public.employee_work_locations for select to authenticated
using (employee_id=public.current_employee_id() or public.is_admin());
drop policy if exists employee_work_locations_admin_all on public.employee_work_locations;
create policy employee_work_locations_admin_all on public.employee_work_locations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists campaign_work_locations_select on public.campaign_work_locations;
create policy campaign_work_locations_select on public.campaign_work_locations for select to authenticated using (true);
drop policy if exists campaign_work_locations_admin_all on public.campaign_work_locations;
create policy campaign_work_locations_admin_all on public.campaign_work_locations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists product_work_locations_select on public.product_work_locations;
create policy product_work_locations_select on public.product_work_locations for select to authenticated using (true);
drop policy if exists product_work_locations_admin_all on public.product_work_locations;
create policy product_work_locations_admin_all on public.product_work_locations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select,insert,update,delete on public.employee_work_locations, public.campaign_work_locations, public.product_work_locations to authenticated;

create or replace function public.set_employee_locations(p_employee_id uuid, p_location_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare primary_location uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if coalesce(array_length(p_location_ids,1),0)=0 then raise exception 'LOCATION_REQUIRED'; end if;
  select id into primary_location from public.work_locations where id=any(p_location_ids) and active order by created_at limit 1;
  if primary_location is null then raise exception 'ACTIVE_LOCATION_REQUIRED'; end if;
  delete from public.employee_work_locations where employee_id=p_employee_id and work_location_id<>all(p_location_ids);
  insert into public.employee_work_locations(employee_id,work_location_id)
  select p_employee_id,id from public.work_locations where id=any(p_location_ids) on conflict do nothing;
  update public.employees set work_location_id=primary_location where id=p_employee_id;
end; $$;
grant execute on function public.set_employee_locations(uuid,uuid[]) to authenticated;

create or replace function public.set_campaign_locations(p_campaign_id uuid, p_location_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare primary_location uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if coalesce(array_length(p_location_ids,1),0)=0 then raise exception 'LOCATION_REQUIRED'; end if;
  select id into primary_location from public.work_locations where id=any(p_location_ids) and active order by created_at limit 1;
  if primary_location is null then raise exception 'ACTIVE_LOCATION_REQUIRED'; end if;
  delete from public.campaign_work_locations where campaign_id=p_campaign_id and work_location_id<>all(p_location_ids);
  insert into public.campaign_work_locations(campaign_id,work_location_id)
  select p_campaign_id,id from public.work_locations where id=any(p_location_ids) on conflict do nothing;
  update public.campaigns set work_location_id=primary_location where id=p_campaign_id;
end; $$;
grant execute on function public.set_campaign_locations(uuid,uuid[]) to authenticated;

create or replace function public.set_product_locations(p_product_id uuid, p_location_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if coalesce(array_length(p_location_ids,1),0)=0 then raise exception 'LOCATION_REQUIRED'; end if;
  delete from public.product_work_locations where product_id=p_product_id and work_location_id<>all(p_location_ids);
  insert into public.product_work_locations(product_id,work_location_id)
  select p_product_id,id from public.work_locations where id=any(p_location_ids) on conflict do nothing;
end; $$;
grant execute on function public.set_product_locations(uuid,uuid[]) to authenticated;

create or replace function public.inherit_product_campaign_locations(p_product_id uuid, p_campaign_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  employee_id uuid:=public.current_employee_id();
  assigned_location_count integer:=0;
begin
  if employee_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.products where id=p_product_id and created_by=employee_id) then raise exception 'PRODUCT_OWNER_REQUIRED'; end if;
  if not exists(select 1 from public.campaign_members where campaign_id=p_campaign_id and employee_id=employee_id and active) then raise exception 'CAMPAIGN_MEMBER_REQUIRED'; end if;
  delete from public.product_work_locations where product_id=p_product_id;
  insert into public.product_work_locations(product_id,work_location_id)
  select p_product_id,work_location_id from public.campaign_work_locations where campaign_id=p_campaign_id on conflict do nothing;

  get diagnostics assigned_location_count = row_count;

  if assigned_location_count=0 then
    insert into public.product_work_locations(product_id,work_location_id)
    select p_product_id,work_location_id from public.campaigns
    where id=p_campaign_id and work_location_id is not null
    on conflict do nothing;
    get diagnostics assigned_location_count = row_count;
  end if;

  if assigned_location_count=0 then raise exception 'CAMPAIGN_LOCATION_REQUIRED'; end if;
end; $$;
grant execute on function public.inherit_product_campaign_locations(uuid,uuid) to authenticated;

create or replace function public.snapshot_active_employees(p_campaign_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  insert into public.campaign_members(campaign_id,employee_id,name_snapshot,email_snapshot,active)
  select p_campaign_id,e.id,e.name,e.email,true from public.employees e
  where e.active and exists (
    select 1 from public.employee_work_locations el
    join public.campaign_work_locations cl on cl.work_location_id=el.work_location_id
    where el.employee_id=e.id and cl.campaign_id=p_campaign_id
  )
  on conflict(campaign_id,employee_id) do update set name_snapshot=excluded.name_snapshot,email_snapshot=excluded.email_snapshot,active=true;
  get diagnostics affected=row_count;
  update public.campaign_members m set active=false
  where m.campaign_id=p_campaign_id and not exists (
    select 1 from public.employee_work_locations el
    join public.campaign_work_locations cl on cl.work_location_id=el.work_location_id
    where el.employee_id=m.employee_id and cl.campaign_id=p_campaign_id
  );
  return affected;
end; $$;
grant execute on function public.snapshot_active_employees(uuid) to authenticated;

create or replace function public.validate_campaign_member_location()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (
    select 1 from public.employee_work_locations el
    join public.campaign_work_locations cl on cl.work_location_id=el.work_location_id
    where el.employee_id=new.employee_id and cl.campaign_id=new.campaign_id
  ) then raise exception 'EMPLOYEE_LOCATION_MISMATCH'; end if;
  return new;
end; $$;

create or replace function public.delete_work_location(p_location_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if exists(select 1 from public.employee_work_locations where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_EMPLOYEES'; end if;
  if exists(select 1 from public.campaign_work_locations where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_CAMPAIGNS'; end if;
  if exists(select 1 from public.product_work_locations where work_location_id=p_location_id) then raise exception 'LOCATION_HAS_PRODUCTS'; end if;
  delete from public.work_locations where id=p_location_id;
end; $$;
grant execute on function public.delete_work_location(uuid) to authenticated;

create table if not exists public.app_migrations (
  migration_key text primary key,
  applied_at timestamptz not null default now()
);

-- Normalize installations that previously used the old default location or
-- assigned every product to every office. The marker prevents later executions
-- of final.sql from overwriting location changes made after this repair.
do $$
declare
  project_location uuid;
  old_default_location uuid;
begin
  if exists (
    select 1 from public.app_migrations
    where migration_key='20260825_product_default_project_office'
  ) then
    return;
  end if;

  insert into public.work_locations(name, active)
  values ('專案辦公室', true)
  on conflict do nothing;

  select id into project_location
  from public.work_locations
  where lower(btrim(name))=lower('專案辦公室')
  order by created_at
  limit 1;

  if project_location is null then
    raise exception 'PROJECT_OFFICE_NOT_FOUND';
  end if;

  select id into old_default_location
  from public.work_locations
  where lower(btrim(name))=lower('主要辦公室')
  order by created_at
  limit 1;

  if old_default_location is not null and old_default_location<>project_location then
    insert into public.employee_work_locations(employee_id,work_location_id)
    select employee_id,project_location
    from public.employee_work_locations
    where work_location_id=old_default_location
    on conflict do nothing;

    insert into public.campaign_work_locations(campaign_id,work_location_id)
    select campaign_id,project_location
    from public.campaign_work_locations
    where work_location_id=old_default_location
    on conflict do nothing;

    update public.employees
    set work_location_id=project_location
    where work_location_id=old_default_location;

    update public.campaigns
    set work_location_id=project_location
    where work_location_id=old_default_location;

    delete from public.employee_work_locations where work_location_id=old_default_location;
    delete from public.campaign_work_locations where work_location_id=old_default_location;
    delete from public.product_work_locations where work_location_id=old_default_location;
    delete from public.work_locations where id=old_default_location;
  end if;

  -- The requested baseline is explicit: every current product belongs only to
  -- 專案辦公室. This also repairs databases that already ran the prior version.
  delete from public.product_work_locations
  where work_location_id<>project_location;

  insert into public.product_work_locations(product_id,work_location_id)
  select id,project_location from public.products
  on conflict do nothing;

  insert into public.app_migrations(migration_key)
  values ('20260825_product_default_project_office')
  on conflict do nothing;
end;
$$;

alter table public.app_migrations enable row level security;
revoke all on public.app_migrations from anon, authenticated;
