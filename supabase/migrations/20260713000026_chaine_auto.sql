-- 1) Table des posts chaîne programmés + auto
create table if not exists channel_posts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null check (kind in ('text','image','video','menu_card','poll')),
  content text not null default '',
  media_url text,
  poll_options jsonb,
  scheduled_at timestamptz not null,
  state text not null default 'scheduled'
    check (state in ('scheduled','pending_approval','posting','posted','failed','canceled')),
  wa_message_id text,
  error text,
  auto_generated boolean not null default false,
  approval_message_id text,
  approval_requested_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists channel_posts_due_idx on channel_posts (state, scheduled_at);
create index if not exists channel_posts_resto_idx on channel_posts (restaurant_id, created_at desc);

alter table channel_posts enable row level security;
-- Lecture/écriture réservées aux membres du resto (pattern is_member repris des statuts).
create policy channel_posts_member_all on channel_posts
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- 2) Réglages Chaîne Auto (mirror auto_status_*, indépendants — toggle/horaires propres)
alter table restaurants add column if not exists auto_channel_enabled boolean not null default false;
alter table restaurants add column if not exists auto_channel_times text[] not null default '{}';
alter table restaurants add column if not exists auto_channel_count int not null default 1;
alter table restaurants add column if not exists auto_channel_cursor int not null default 0;
alter table restaurants add column if not exists auto_channel_last_slot text;

-- 3) Écho statut → chaîne
alter table restaurants add column if not exists auto_status_echo_channel boolean not null default false;
alter table statuses add column if not exists echo_to_channel boolean not null default false;

notify pgrst, 'reload schema';
