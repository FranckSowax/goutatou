insert into storage.buckets (id, name, public) values ('lp-media', 'lp-media', true)
on conflict do nothing;

create policy lp_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lp-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

create policy lp_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'lp-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

-- Pas de policy SELECT : bucket public servi par URL directe, pas de listing (advisor 0025).
