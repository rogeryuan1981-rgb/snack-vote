-- Expected arrival date and employee-facing locked purchase summary.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.campaigns
  add column if not exists purchase_expected_arrival_date date;

notify pgrst, 'reload schema';
