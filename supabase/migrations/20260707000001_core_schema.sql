create extension if not exists pgtap with schema extensions;

create type order_mode as enum ('drive', 'livraison', 'sur_place');
create type order_status as enum ('recue', 'en_preparation', 'prete', 'recuperee', 'annulee');
create type order_source as enum ('whatsapp', 'web');

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  branding jsonb not null default '{}',
  lp_config jsonb not null default '{}',
  timezone text not null default 'Africa/Libreville',
  drive_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table restaurant_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  primary key (user_id, restaurant_id)
);

create table whapi_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  channel_id text,
  phone text,
  token_encrypted text not null,
  status text not null default 'active' check (status in ('active', 'error')),
  last_webhook_at timestamptz,
  created_at timestamptz not null default now()
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price int not null check (price >= 0),
  photo_url text,
  available boolean not null default true,
  position int not null default 0
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  phone text not null,
  chat_id text not null,
  name text,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  state text not null default 'ACCUEIL',
  cart jsonb not null default '{"items": []}',
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_id)
);

create table drive_slots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  position int not null default 0,
  active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id),
  source order_source not null default 'whatsapp',
  mode order_mode not null,
  status order_status not null default 'recue',
  drive_slot_id uuid references drive_slots(id),
  delivery_address text,
  total int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_restaurant_status_idx on orders (restaurant_id, status, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  name text not null,
  unit_price int not null,
  qty int not null check (qty > 0)
);

create table message_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  whapi_message_id text unique,
  chat_id text not null,
  body text,
  error text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'premium')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  created_at timestamptz not null default now()
);

-- Realtime : le dashboard écoute orders ; le notifier a besoin de l'ancienne valeur de status
alter publication supabase_realtime add table orders;
alter table orders replica identity full;
