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
