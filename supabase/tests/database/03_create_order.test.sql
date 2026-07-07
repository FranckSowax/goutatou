begin;
select plan(3);

insert into restaurants (id, slug, name) values ('20000000-0000-0000-0000-000000000001', 'resto-t', 'Resto T');
insert into menu_categories (id, restaurant_id, name)
  values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Plats');
insert into menu_items (id, restaurant_id, category_id, name, price)
  values ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000002', 'Bo Bun', 4500);
insert into customers (id, restaurant_id, phone, chat_id)
  values ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
          '24177000001', '24177000001@s.whatsapp.net');

select results_eq(
  $$select total from create_order(
      '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
      'whatsapp', 'sur_place',
      '[{"menu_item_id": "20000000-0000-0000-0000-000000000003", "qty": 2}]'::jsonb,
      null, null)$$,
  array[9000], 'total = 2 x 4500');
select results_eq('select count(*)::int from orders', array[1], '1 commande créée');
select results_eq('select qty from order_items', array[2], 'ligne qty 2');

select * from finish();
rollback;
