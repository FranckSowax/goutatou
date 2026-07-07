insert into storage.buckets (id, name, public) values ('menu-photos', 'menu-photos', true)
on conflict do nothing;
create policy menu_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos');
create policy menu_photos_read on storage.objects for select using (bucket_id = 'menu-photos');
