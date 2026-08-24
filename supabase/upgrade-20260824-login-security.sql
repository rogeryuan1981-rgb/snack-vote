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
