alter table restaurants add column wheel_enabled boolean not null default false;
alter table restaurants add column wheel_trigger_orders int not null default 5 check (wheel_trigger_orders >= 1);

create table prizes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  weight int not null default 1 check (weight >= 1),
  stock int not null default -1,          -- -1 = illimité
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index prizes_active_idx on prizes (restaurant_id, active);

create table wheel_spins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  prize_id uuid not null references prizes(id),
  code text not null,
  jti text not null unique,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  unique (restaurant_id, code)
);
create index wheel_spins_code_idx on wheel_spins (restaurant_id, code);

alter table prizes enable row level security;
alter table wheel_spins enable row level security;

create policy tenant_all_prizes on prizes for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_wheel_spins on wheel_spins for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
