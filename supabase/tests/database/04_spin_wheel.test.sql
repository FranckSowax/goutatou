begin;
select plan(5);

insert into restaurants (id, slug, name, wheel_enabled) values
  ('40000000-0000-0000-0000-000000000001', 'resto-w', 'Resto W', true);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '24177000900', '24177000900@s.whatsapp.net');
insert into prizes (id, restaurant_id, label, weight, stock) values
  ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Café offert', 1, 2);

-- 1er spin : gagne le seul lot dispo, code renvoyé
select isnt((select code from spin_wheel(
  '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'jti-A')), null, 'spin renvoie un code');
-- stock décrémenté à 1
select results_eq($$select stock from prizes where id='40000000-0000-0000-0000-000000000003'$$, array[1], 'stock -1');
-- même jti → already_spun
select throws_like($$select * from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-A')$$, '%already_spun%', 'jti unique');
-- un spin de plus (jti-B) épuise le stock à 0
select isnt((select code from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-B')), null, '2e spin ok');
-- plus de stock → no_prize
select throws_like($$select * from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-C')$$, '%no_prize%', 'stock épuisé');

select * from finish();
rollback;
