insert into storage.buckets (id, name, public) values ('menu-photos', 'menu-photos', true)
on conflict do nothing;

-- write (insert): only into your own restaurant's folder
create policy menu_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

-- overwrite (update): same tenant constraint on both existing and new row
create policy menu_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-photos'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

-- read stays public
create policy menu_photos_read on storage.objects for select using (bucket_id = 'menu-photos');
