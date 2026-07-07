begin;
select plan(4);

-- Deux restos, deux users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.io'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.io');
insert into restaurants (id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'resto-a', 'Resto A'),
  ('10000000-0000-0000-0000-000000000002', 'resto-b', 'Resto B');
insert into restaurant_members (user_id, restaurant_id) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002');
insert into customers (id, restaurant_id, phone, chat_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '241000resto-a', '241000resto-a@s.whatsapp.net'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '241000resto-b', '241000resto-b@s.whatsapp.net');
insert into orders (restaurant_id, customer_id, mode, total) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'sur_place', 1000),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'sur_place', 1000);

-- User A ne voit que le resto A
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select results_eq('select count(*)::int from restaurants', array[1], 'A voit 1 restaurant');
select results_eq('select count(*)::int from orders', array[1], 'A voit 1 commande');
select results_eq(
  $$select count(*)::int from restaurants where slug = 'resto-b'$$, array[0],
  'A ne voit pas le resto B');

-- Anonyme ne voit rien
set local role anon;
set local request.jwt.claims to '{}';
select results_eq('select count(*)::int from restaurants', array[0], 'anon ne voit rien');

select * from finish();
rollback;
