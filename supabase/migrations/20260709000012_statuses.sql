create type status_state as enum ('draft', 'scheduled', 'posting', 'posted', 'failed', 'canceled');

create table statuses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image')),
  content text not null,
  media_url text,
  scheduled_at timestamptz,
  state status_state not null default 'draft',
  posted_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index statuses_worker_idx on statuses (state, scheduled_at);

alter table statuses enable row level security;
create policy tenant_all_statuses on statuses for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

alter publication supabase_realtime add table statuses;

insert into storage.buckets (id, name, public) values ('status-media', 'status-media', true)
on conflict do nothing;
create policy status_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'status-media'
    and ((storage.foldername(name))[1] in (
      select restaurant_id::text from restaurant_members where user_id = auth.uid())
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))));
create policy status_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'status-media'
    and ((storage.foldername(name))[1] in (
      select restaurant_id::text from restaurant_members where user_id = auth.uid())
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))));
