begin;
select plan(8);

-- Fixtures : resto + user membre + catégorie + plat
insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-00000000000a', 'sup-a@test.io');
insert into restaurants (id, slug, name) values
  ('50000000-0000-0000-0000-000000000001', 'resto-sup', 'Resto Sup');
insert into restaurant_members (user_id, restaurant_id) values
  ('50000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001');
insert into menu_categories (id, restaurant_id, name) values
  ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'Plats');
insert into menu_items (id, restaurant_id, category_id, name, price) values
  ('50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Poulet braisé', 3000);

-- 1. table + colonnes clés
select has_table('public', 'menu_supplements', 'menu_supplements existe');
select has_column('public', 'menu_supplements', 'menu_item_id', 'colonne menu_item_id existe');
select has_column('public', 'menu_supplements', 'price', 'colonne price existe');

-- 2. RLS activée
select results_eq(
  $$select relrowsecurity from pg_class where relname = 'menu_supplements'$$,
  array[true],
  'RLS activée sur menu_supplements');

-- 3. policy présente
select results_eq(
  $$select count(*)::int from pg_policies where tablename = 'menu_supplements' and policyname = 'tenant_all_menu_supplements'$$,
  array[1],
  'policy tenant_all_menu_supplements présente');

-- 4. insert + visibilité via is_member (membre du resto)
insert into menu_supplements (id, restaurant_id, menu_item_id, name, price) values
  ('50000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'Fromage', 500);

set local role authenticated;
set local request.jwt.claims to '{"sub": "50000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select results_eq(
  'select count(*)::int from menu_supplements',
  array[1],
  'membre du resto voit son supplément');
reset role;
reset request.jwt.claims;

-- 5. cascade delete : suppression du plat supprime ses suppléments
delete from menu_items where id = '50000000-0000-0000-0000-000000000003';
select results_eq(
  $$select count(*)::int from menu_supplements where id = '50000000-0000-0000-0000-000000000004'$$,
  array[0],
  'suppression du plat supprime en cascade ses suppléments');

-- 6. contrainte price >= 0
insert into menu_items (id, restaurant_id, category_id, name, price) values
  ('50000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Poisson braisé', 3500);
select throws_like(
  $$insert into menu_supplements (restaurant_id, menu_item_id, name, price) values ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'Extra', -100)$$,
  '%violates check constraint%',
  'price négatif rejeté par la contrainte check');

select * from finish();
rollback;
