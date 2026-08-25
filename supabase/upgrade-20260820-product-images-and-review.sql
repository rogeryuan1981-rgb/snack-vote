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
