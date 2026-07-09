create type campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'canceled');
create type recipient_status as enum ('pending', 'sent', 'failed');

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  body text not null,
  media_url text,
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index campaigns_worker_idx on campaigns (status, scheduled_at);

create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status recipient_status not null default 'pending',
  error text,
  sent_at timestamptz,
  unique (campaign_id, customer_id)
);
create index campaign_recipients_pending_idx on campaign_recipients (campaign_id, status);

alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;

create policy tenant_all_campaigns on campaigns for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_camp_recipients on campaign_recipients for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- Realtime : le dashboard suit la progression des campagnes
alter publication supabase_realtime add table campaigns;

-- Storage : médias de campagne, tenant-scopé, sans listing public
insert into storage.buckets (id, name, public) values ('campaign-media', 'campaign-media', true)
on conflict do nothing;

create policy campaign_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );
create policy campaign_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );
