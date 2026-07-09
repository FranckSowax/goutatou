-- Rate-limiting durable (fenêtre fixe) pour endpoints publics.
-- Comptage atomique via insert … on conflict ; aucun check-then-act.
create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- La table n'est manipulée que par la fonction (service_role). Deny par défaut.
alter table rate_limit_hits enable row level security;

create or replace function hit_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns table(allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  -- Bornage défensif de la fenêtre.
  if p_window_seconds < 1 then
    p_window_seconds := 1;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_hits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  -- Purge opportuniste : évite un cron, garde la table petite.
  if random() < 0.01 then
    delete from rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  allowed := v_count <= p_limit;
  if allowed then
    retry_after := 0;
  else
    retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::int
    );
  end if;
  return next;
end;
$$;

revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
