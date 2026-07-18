-- Carte de fidélité digitale à tampons (remplace la roue). Compteur cumulatif de commandes par
-- client + paliers (seuil → lot) fixés par le gérant + crédit +1 en caisse via QR fixe, protégé
-- par un cooldown atomique (reprise du pattern de garde de spin_wheel).

alter table public.customers
  add column if not exists loyalty_stamps int not null default 0,
  add column if not exists birthdate date,
  add column if not exists last_stamp_at timestamptz;

alter table public.restaurants
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_stamp_code text default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists loyalty_cooldown_hours int not null default 4,
  add column if not exists loyalty_logo_url text,
  add column if not exists loyalty_cover_url text;

-- Paliers : seuil de commandes → lot (cumulatifs, jalons uniques par resto).
create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  threshold int not null check (threshold >= 1),
  label text not null,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (restaurant_id, threshold)
);
create index if not exists loyalty_rewards_active_idx on public.loyalty_rewards (restaurant_id, active);

-- Récupérations de lots en caisse (un palier récupéré une seule fois par client).
create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  reward_id uuid references loyalty_rewards(id) on delete set null,
  threshold int not null,
  redeemed_at timestamptz not null default now(),
  redeemed_by uuid references auth.users(id),
  unique (restaurant_id, customer_id, threshold)
);
create index if not exists loyalty_redemptions_customer_idx on public.loyalty_redemptions (restaurant_id, customer_id);

-- Journal des tampons (audit / analytics).
create table if not exists public.loyalty_stamps_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_stamps_log_customer_idx on public.loyalty_stamps_log (restaurant_id, customer_id, created_at desc);

alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_stamps_log enable row level security;
create policy tenant_all_loyalty_rewards on public.loyalty_rewards
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_loyalty_redemptions on public.loyalty_redemptions
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_loyalty_stamps_log on public.loyalty_stamps_log
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- Crédit +1 tampon, atomique et idempotent-safe : verrou par client, cooldown re-vérifié sous
-- verrou, incrément, journal, et détection du palier atteint exactement à ce compteur.
create or replace function public.add_loyalty_stamp(
  p_restaurant_id uuid,
  p_customer_id uuid
) returns table(stamps int, reached_threshold int, reached_label text)
language plpgsql security definer set search_path = public as $$
declare
  v_cooldown int;
  v_last timestamptz;
  v_new int;
  v_threshold int;
  v_label text;
begin
  perform pg_advisory_xact_lock(hashtext(p_customer_id::text));

  select coalesce(loyalty_cooldown_hours, 4) into v_cooldown
  from restaurants where id = p_restaurant_id;

  select last_stamp_at into v_last
  from customers
  where id = p_customer_id and restaurant_id = p_restaurant_id
  for update;
  if not found then raise exception 'customer_not_found'; end if;

  if v_last is not null and v_last + make_interval(hours => v_cooldown) > now() then
    raise exception 'cooldown';
  end if;

  update customers
    set loyalty_stamps = coalesce(loyalty_stamps, 0) + 1, last_stamp_at = now()
    where id = p_customer_id and restaurant_id = p_restaurant_id
    returning loyalty_stamps into v_new;

  insert into loyalty_stamps_log (restaurant_id, customer_id) values (p_restaurant_id, p_customer_id);

  select threshold, label into v_threshold, v_label
  from loyalty_rewards
  where restaurant_id = p_restaurant_id and active = true and threshold = v_new
  limit 1;

  return query select v_new, v_threshold, v_label;
end;
$$;
revoke all on function public.add_loyalty_stamp(uuid, uuid) from public;
grant execute on function public.add_loyalty_stamp(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
