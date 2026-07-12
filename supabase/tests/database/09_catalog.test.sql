begin;
select plan(9);

-- Fixtures : resto + catégorie + plat
insert into restaurants (id, slug, name) values
  ('60000000-0000-0000-0000-000000000001', 'resto-cat', 'Resto Catalogue');
insert into menu_categories (id, restaurant_id, name) values
  ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Plats');
insert into menu_items (id, restaurant_id, category_id, name, price) values
  ('60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Poulet braisé', 3000);

-- 1-2. colonne menu_items.wa_product_id
select has_column('public', 'menu_items', 'wa_product_id', 'colonne wa_product_id existe sur menu_items');
select results_eq(
  $$select wa_product_id from menu_items where id = '60000000-0000-0000-0000-000000000003'$$,
  array[null::text],
  'wa_product_id nul par défaut (pas encore synchronisé)');

-- 3-6. colonnes restaurants
select has_column('public', 'restaurants', 'catalog_enabled', 'colonne catalog_enabled existe');
select has_column('public', 'restaurants', 'catalog_sync_requested_at', 'colonne catalog_sync_requested_at existe');
select has_column('public', 'restaurants', 'catalog_synced_at', 'colonne catalog_synced_at existe');
select has_column('public', 'restaurants', 'catalog_sync_error', 'colonne catalog_sync_error existe');

-- 7. catalog_enabled : défaut false, non nul (non-régression : photos individuelles inchangées)
select results_eq(
  $$select catalog_enabled from restaurants where id = '60000000-0000-0000-0000-000000000001'$$,
  array[false],
  'catalog_enabled false par défaut');

-- 8. requested_at/synced_at nuls par défaut (rien à synchroniser tant que non demandé)
select results_eq(
  $$select catalog_sync_requested_at is null and catalog_synced_at is null from restaurants where id = '60000000-0000-0000-0000-000000000001'$$,
  array[true],
  'catalog_sync_requested_at et catalog_synced_at nuls par défaut');

-- 9. sync : requested_at posé par l'admin, synced_at + error écrits par le worker (claim-first)
update restaurants set catalog_sync_requested_at = now() where id = '60000000-0000-0000-0000-000000000001';
update restaurants set catalog_synced_at = now(), catalog_sync_error = null
  where id = '60000000-0000-0000-0000-000000000001' and catalog_sync_requested_at > coalesce(catalog_synced_at, 'epoch');
select results_eq(
  $$select catalog_synced_at is not null from restaurants where id = '60000000-0000-0000-0000-000000000001'$$,
  array[true],
  'catalog_synced_at écrit après passage du worker (pattern claim-first)');

select * from finish();
rollback;
