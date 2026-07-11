begin;
select plan(18);

-- Fixtures : un resto, deux plats, un client.
insert into restaurants (id, slug, name) values
  ('70000000-0000-0000-0000-000000000001', 'resto-sup2', 'Resto Sup2');
insert into menu_categories (id, restaurant_id, name) values
  ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'Plats');
insert into menu_items (id, restaurant_id, category_id, name, price) values
  ('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Bo Bun', 4500),
  ('70000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Frites', 1000);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('70000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', '24177000070', '24177000070@s.whatsapp.net');

-- Second resto, uniquement pour fabriquer un supplément "intrus" dont le
-- restaurant_id ne correspond pas au plat référencé (test défense en
-- profondeur du filtre s.restaurant_id = p_restaurant_id).
insert into restaurants (id, slug, name) values
  ('70000000-0000-0000-0000-000000000010', 'resto-sup2-b', 'Resto Sup2 B');

-- Suppléments : 2 valides sur Bo Bun, 1 sur Frites (cross-plat), 1 "intrus"
-- cross-resto, 1 indisponible.
insert into menu_supplements (id, restaurant_id, menu_item_id, name, price, available) values
  ('70000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'Fromage', 500, true),
  ('70000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'Sauce piment', 300, true),
  ('70000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', 'Extra frites', 200, true),
  ('70000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000003', 'Intrus', 999, true),
  ('70000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'Oignons', 100, false);

-- (a) Rétrocompat v1 : appel SANS supplement_ids → résultat identique à
-- l'ancienne fonction (même total, mêmes lignes order_items).
create temp table t_a as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 2}]'::jsonb,
    null, null);

select results_eq(
  $$select total from t_a$$,
  array[9000], 'v1 sans supplement_ids : total = 2 x 4500');
select results_eq(
  $$select count(*)::int from order_items where order_id = (select order_id from t_a)$$,
  array[1], 'v1 sans supplement_ids : 1 seule ligne order_items');
select results_eq(
  $$select name, unit_price, qty from order_items where order_id = (select order_id from t_a)$$,
  $$values ('Bo Bun'::text, 4500, 2)$$,
  'v1 sans supplement_ids : ligne identique à avant (nom/prix/qty)');

-- (b) 2 suppléments valides sur un item qty 2 → 2 lignes '↳ ' qty 2 + total.
create temp table t_b as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 2,
       "supplement_ids": ["70000000-0000-0000-0000-000000000006", "70000000-0000-0000-0000-000000000007"]}]'::jsonb,
    null, null);

select results_eq(
  $$select total from t_b$$,
  array[10600], '2 suppléments valides qty 2 : total = 2x4500 + 2x500 + 2x300');
select results_eq(
  $$select count(*)::int from order_items where order_id = (select order_id from t_b)$$,
  array[3], '2 suppléments valides : 3 lignes (1 plat + 2 suppléments)');
select results_eq(
  $$select qty from order_items where order_id = (select order_id from t_b) and name like '↳ %' order by name$$,
  array[2, 2], '2 suppléments valides : lignes ↳ avec qty du parent (2)');
select results_eq(
  $$select name from order_items where order_id = (select order_id from t_b) and name like '↳ %' order by name$$,
  array['↳ Fromage', '↳ Sauce piment'], '2 suppléments valides : noms des lignes ↳');

-- (c)+(d)+(e)+dédup : id cross-plat, id cross-resto, id indisponible et un
-- doublon d'id valide sont tous silencieusement ignorés / dédupliqués.
create temp table t_c as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 1,
       "supplement_ids": [
         "70000000-0000-0000-0000-000000000006",
         "70000000-0000-0000-0000-000000000006",
         "70000000-0000-0000-0000-000000000007",
         "70000000-0000-0000-0000-000000000008",
         "70000000-0000-0000-0000-000000000009",
         "70000000-0000-0000-0000-00000000000b"
       ]}]'::jsonb,
    null, null);

select results_eq(
  $$select total from t_c$$,
  array[5300], 'ids invalides ignorés + dédup : total = 4500 + 500 + 300 (qty 1)');
select results_eq(
  $$select count(*)::int from order_items where order_id = (select order_id from t_c)$$,
  array[3], 'ids invalides ignorés + dédup : 3 lignes (1 plat + 2 suppléments valides, pas de doublon)');
select results_eq(
  $$select count(*)::int from order_items
      where order_id = (select order_id from t_c)
        and (name like '%Extra frites%' or name like '%Intrus%' or name like '%Oignons%')$$,
  array[0], 'ids invalides ignorés : cross-plat / cross-resto / indisponible absents');

-- (g) Adjacence multi-items : panier [Bo Bun + 2 supps, Frites + 1 supp] →
-- les lignes ordonnées par position sont exactement
-- [Bo Bun, ↳ Fromage, ↳ Sauce piment, Frites, ↳ Extra frites].
create temp table t_d as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 1,
       "supplement_ids": ["70000000-0000-0000-0000-000000000006", "70000000-0000-0000-0000-000000000007"]},
      {"menu_item_id": "70000000-0000-0000-0000-000000000004", "qty": 3,
       "supplement_ids": ["70000000-0000-0000-0000-000000000008"]}]'::jsonb,
    null, null);

select results_eq(
  $$select name, position from order_items where order_id = (select order_id from t_d) order by position$$,
  $$values ('Bo Bun'::text, 0), ('↳ Fromage', 1), ('↳ Sauce piment', 2), ('Frites', 3), ('↳ Extra frites', 4)$$,
  'adjacence multi-items : chaque ↳ suit immédiatement son plat parent (par position)');
select results_eq(
  $$select total from t_d$$,
  array[8900], 'adjacence multi-items : total = 4500+500+300 + 3x1000 + 3x200');

-- (h) Parent dupliqué : le MÊME menu_item deux fois avec des supplement_ids
-- différents → 2 lignes parentes, chacune immédiatement suivie de SES
-- suppléments (l'adjacence par position est le mécanisme d'attribution).
create temp table t_e as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 1,
       "supplement_ids": ["70000000-0000-0000-0000-000000000006"]},
      {"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 2,
       "supplement_ids": ["70000000-0000-0000-0000-000000000007"]}]'::jsonb,
    null, null);

select results_eq(
  $$select name, qty, position from order_items where order_id = (select order_id from t_e) order by position$$,
  $$values ('Bo Bun'::text, 1, 0), ('↳ Fromage', 1, 1), ('Bo Bun', 2, 2), ('↳ Sauce piment', 2, 3)$$,
  'parent dupliqué : chaque occurrence du plat est suivie de ses propres suppléments');
select results_eq(
  $$select total from t_e$$,
  array[14600], 'parent dupliqué : total = (4500+500) + 2x(4500+300)');

-- (i) Id malformé (pas un uuid) : silencieusement ignoré — la commande
-- aboutit avec les seuls suppléments valides, aucun throw sur le cast.
create temp table t_i as
  select * from create_order(
    '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
    'whatsapp', 'sur_place',
    '[{"menu_item_id": "70000000-0000-0000-0000-000000000003", "qty": 1,
       "supplement_ids": ["pas-un-uuid", "", "70000000-0000-0000-0000-000000000006"]}]'::jsonb,
    null, null);

select results_eq(
  $$select total from t_i$$,
  array[5000], 'ids malformés ignorés : total = plat 4500 + Fromage 500');
select results_eq(
  $$select count(*)::int from order_items where order_id = (select order_id from t_i)$$,
  array[2], 'ids malformés ignorés : 1 ligne plat + 1 ligne supplément');

-- (f) ACL : anon et authenticated ne peuvent pas exécuter create_order
-- (grant service_role only, préservé depuis 0005).
select results_eq(
  $$select has_function_privilege(
      'anon',
      'public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text)',
      'EXECUTE')$$,
  array[false], 'anon ne peut pas exécuter create_order');
select results_eq(
  $$select has_function_privilege(
      'authenticated',
      'public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text)',
      'EXECUTE')$$,
  array[false], 'authenticated ne peut pas exécuter create_order');

select * from finish();
rollback;
