create or replace function bump_campaign_counter(p_campaign_id uuid, p_sent int, p_failed int)
returns void language sql security definer set search_path = public as $$
  update campaigns
    set sent_count = sent_count + p_sent,
        failed_count = failed_count + p_failed
  where id = p_campaign_id;
$$;
revoke execute on function bump_campaign_counter(uuid, int, int) from public, anon, authenticated;
grant execute on function bump_campaign_counter(uuid, int, int) to service_role;
