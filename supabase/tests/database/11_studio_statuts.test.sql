begin;
select plan(17);

-- Fixtures : resto
insert into restaurants (id, slug, name) values
  ('70000000-0000-0000-0000-000000000001', 'resto-studio-statuts', 'Resto Studio Statuts');

-- 1-4. nouvelles colonnes statuses
select has_column('public', 'statuses', 'bg_color', 'colonne bg_color existe sur statuses');
select has_column('public', 'statuses', 'caption_color', 'colonne caption_color existe sur statuses');
select has_column('public', 'statuses', 'font_type', 'colonne font_type existe sur statuses');
select has_column('public', 'statuses', 'audience', 'colonne audience existe sur statuses');

-- 5. audience : défaut 'all'
insert into statuses (id, restaurant_id, kind, content) values
  ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'text', 'Statut par défaut');
select results_eq(
  $$select audience from statuses where id = '70000000-0000-0000-0000-000000000002'$$,
  array['all'],
  'audience vaut ''all'' par défaut');

-- 6. audience : accepte 'optin'
update statuses set audience = 'optin' where id = '70000000-0000-0000-0000-000000000002';
select results_eq(
  $$select audience from statuses where id = '70000000-0000-0000-0000-000000000002'$$,
  array['optin'],
  'audience accepte ''optin''');

-- 7. audience : rejette une valeur hors énum
select throws_like(
  $$update statuses set audience = 'vip' where id = '70000000-0000-0000-0000-000000000002'$$,
  '%violates check constraint%',
  'audience rejette une valeur hors (all, optin)');

-- 8. kind : accepte désormais 'video'
insert into statuses (id, restaurant_id, kind, content, media_url) values
  ('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'video', 'Vidéo promo', 'https://cdn.example.com/promo.mp4');
select results_eq(
  $$select kind from statuses where id = '70000000-0000-0000-0000-000000000003'$$,
  array['video'],
  'kind accepte ''video''');

-- 9. kind : les valeurs existantes ('text', 'image') restent acceptées
insert into statuses (id, restaurant_id, kind, content, media_url) values
  ('70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', 'image', 'Image promo', 'https://cdn.example.com/promo.jpg');
select results_eq(
  $$select kind from statuses where id = '70000000-0000-0000-0000-000000000004'$$,
  array['image'],
  'kind accepte toujours ''image'' (non-régression)');

-- 10. kind : rejette une valeur hors énum
select throws_like(
  $$insert into statuses (restaurant_id, kind, content) values ('70000000-0000-0000-0000-000000000001', 'audio', 'x')$$,
  '%violates check constraint%',
  'kind rejette une valeur hors (text, image, video)');

-- 11-15. nouvelles colonnes restaurants (auto-status)
select has_column('public', 'restaurants', 'auto_status_enabled', 'colonne auto_status_enabled existe');
select has_column('public', 'restaurants', 'auto_status_times', 'colonne auto_status_times existe');
select has_column('public', 'restaurants', 'auto_status_count', 'colonne auto_status_count existe');
select has_column('public', 'restaurants', 'auto_status_cursor', 'colonne auto_status_cursor existe');
select has_column('public', 'restaurants', 'auto_status_last_slot', 'colonne auto_status_last_slot existe');

-- 16. valeurs par défaut du réglage auto-status
select results_eq(
  $$select auto_status_enabled, auto_status_times, auto_status_count, auto_status_cursor, auto_status_last_slot is null
    from restaurants where id = '70000000-0000-0000-0000-000000000001'$$,
  $$values (false, '[]'::jsonb, 1, 0, true)$$,
  'auto_status_* : défauts corrects (désactivé, aucun créneau, 1 statut, curseur 0, jamais exécuté)');

-- 17. auto_status_count : contrainte check (1 à 3)
select throws_like(
  $$update restaurants set auto_status_count = 4 where id = '70000000-0000-0000-0000-000000000001'$$,
  '%violates check constraint%',
  'auto_status_count rejette une valeur hors 1-3');

select * from finish();
rollback;
