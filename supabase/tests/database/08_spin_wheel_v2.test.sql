begin;
select plan(28);

-- =====================================================================
-- 0. DDL : colonnes et nullabilité ajoutées par la migration 0017
-- =====================================================================

select has_column('public', 'prizes', 'image_url', 'prizes.image_url existe');
select has_column('public', 'restaurants', 'wheel_unlucky_weight', 'restaurants.wheel_unlucky_weight existe');
select has_column('public', 'restaurants', 'wheel_retry_weight', 'restaurants.wheel_retry_weight existe');
select has_column('public', 'wheel_spins', 'outcome', 'wheel_spins.outcome existe');
select has_column('public', 'wheel_spins', 'expires_at', 'wheel_spins.expires_at existe');
select has_column('public', 'wheel_spins', 'reminded_at', 'wheel_spins.reminded_at existe');

select ok(
  (select not attnotnull from pg_attribute where attrelid = 'wheel_spins'::regclass and attname = 'prize_id'),
  'wheel_spins.prize_id est nullable (lose/retry)');
select ok(
  (select not attnotnull from pg_attribute where attrelid = 'wheel_spins'::regclass and attname = 'code'),
  'wheel_spins.code est nullable (lose/retry)');

-- =====================================================================
-- 1. Rétrocompat : wheel_unlucky_weight/wheel_retry_weight = 0 (défaut)
--    => comportement byte-identique à v1 (toujours gagnant, même flux).
-- =====================================================================

insert into restaurants (id, slug, name, wheel_enabled) values
  ('80000000-0000-0000-0000-000000000001', 'resto-w2', 'Resto W2', true);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '24177000901', '24177000901@s.whatsapp.net');
insert into prizes (id, restaurant_id, label, weight, stock) values
  ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', 'Café offert', 1, 2);

select isnt((select code from spin_wheel(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'jti-v2-A')), null, 'rétrocompat 0/0 : spin renvoie un code');
select results_eq($$select stock from prizes where id='80000000-0000-0000-0000-000000000003'$$, array[1], 'rétrocompat 0/0 : stock -1');
select throws_like($$select * from spin_wheel(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','jti-v2-A')$$, '%already_spun%', 'rétrocompat 0/0 : jti unique (identique v1)');
select isnt((select code from spin_wheel(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','jti-v2-B')), null, 'rétrocompat 0/0 : 2e spin ok, stock -> 0');
select throws_like($$select * from spin_wheel(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','jti-v2-C')$$, '%no_prize%', 'rétrocompat 0/0 : stock épuisé (identique v1)');

select results_eq($$select outcome from wheel_spins where jti = 'jti-v2-A'$$, array['prize'], 'rétrocompat 0/0 : outcome = prize');
select ok(
  (select expires_at between now() + interval '29 days' and now() + interval '31 days'
   from wheel_spins where jti = 'jti-v2-A'),
  'gain : expires_at ≈ now() + 30 jours');

-- =====================================================================
-- 2. Segment "perdu" seul (wheel_unlucky_weight énorme, aucun lot en stock)
-- =====================================================================

insert into restaurants (id, slug, name, wheel_enabled, wheel_unlucky_weight) values
  ('80000000-0000-0000-0000-000000000010', 'resto-lose', 'Resto Lose', true, 1000);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('80000000-0000-0000-0000-000000000011', '80000000-0000-0000-0000-000000000010', '24177000902', '24177000902@s.whatsapp.net');

select results_eq($$select outcome from spin_wheel(
  '80000000-0000-0000-0000-000000000010', '80000000-0000-0000-0000-000000000011', 'jti-v2-lose')$$,
  array['lose'], 'segment perdu seul : outcome = lose');
select ok(
  (select prize_id is null and code is null from wheel_spins where jti = 'jti-v2-lose'),
  'segment perdu : ni prize_id ni code enregistrés');

-- =====================================================================
-- 3. Segment "rejouez" seul (wheel_retry_weight énorme, aucun lot en stock)
-- =====================================================================

insert into restaurants (id, slug, name, wheel_enabled, wheel_retry_weight) values
  ('80000000-0000-0000-0000-000000000020', 'resto-retry', 'Resto Retry', true, 1000);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('80000000-0000-0000-0000-000000000021', '80000000-0000-0000-0000-000000000020', '24177000903', '24177000903@s.whatsapp.net');

select results_eq($$select outcome from spin_wheel(
  '80000000-0000-0000-0000-000000000020', '80000000-0000-0000-0000-000000000021', 'jti-v2-retry')$$,
  array['retry'], 'segment rejouez seul : outcome = retry');
select ok(
  (select prize_id is null and code is null from wheel_spins where jti = 'jti-v2-retry'),
  'segment rejouez : ni prize_id ni code enregistrés');

-- =====================================================================
-- 4. Pondération à seuil unique (setseed) : lots + perdu + rejouez mélangés
--    prize weight=3, unlucky=2, retry=5 => total=10.
--    Seeds choisis empiriquement pour retomber dans chaque segment :
--    setseed(0.99) -> random()=0.2419  -> r=2.419  (< 3)      => prize
--    setseed(0.45) -> random()=0.3468  -> r=3.468  (in [3,5)) => lose
--    setseed(0.123)-> random()=0.5485  -> r=5.485  (in [5,10))=> retry
-- =====================================================================

insert into restaurants (id, slug, name, wheel_enabled, wheel_unlucky_weight, wheel_retry_weight) values
  ('80000000-0000-0000-0000-000000000030', 'resto-mix', 'Resto Mix', true, 2, 5);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('80000000-0000-0000-0000-000000000031', '80000000-0000-0000-0000-000000000030', '24177000904', '24177000904@s.whatsapp.net');
insert into prizes (id, restaurant_id, label, weight, stock) values
  ('80000000-0000-0000-0000-000000000032', '80000000-0000-0000-0000-000000000030', 'Menu offert', 3, 5);

select setseed(0.99);
select results_eq($$select outcome from spin_wheel(
  '80000000-0000-0000-0000-000000000030', '80000000-0000-0000-0000-000000000031', 'jti-v2-mix-prize')$$,
  array['prize'], 'pondération (seed 0.99) : segment lot => prize');
select results_eq($$select stock from prizes where id = '80000000-0000-0000-0000-000000000032'$$,
  array[4], 'pondération : stock décrémenté après un gain (5 -> 4)');

select setseed(0.45);
select results_eq($$select outcome from spin_wheel(
  '80000000-0000-0000-0000-000000000030', '80000000-0000-0000-0000-000000000031', 'jti-v2-mix-lose')$$,
  array['lose'], 'pondération (seed 0.45) : segment perdu => lose');
select results_eq($$select stock from prizes where id = '80000000-0000-0000-0000-000000000032'$$,
  array[4], 'pondération : stock inchangé après un lose (4 -> 4)');

select setseed(0.123);
select results_eq($$select outcome from spin_wheel(
  '80000000-0000-0000-0000-000000000030', '80000000-0000-0000-0000-000000000031', 'jti-v2-mix-retry')$$,
  array['retry'], 'pondération (seed 0.123) : segment rejouez => retry');
select results_eq($$select stock from prizes where id = '80000000-0000-0000-0000-000000000032'$$,
  array[4], 'pondération : stock inchangé après un retry (4 -> 4)');

-- =====================================================================
-- 5. ACL service_role uniquement (re-posée à l'identique)
-- =====================================================================

select ok(not has_function_privilege('anon', 'spin_wheel(uuid,uuid,text)', 'execute'),
  'ACL : anon ne peut pas exécuter spin_wheel');
select ok(not has_function_privilege('authenticated', 'spin_wheel(uuid,uuid,text)', 'execute'),
  'ACL : authenticated ne peut pas exécuter spin_wheel');
select ok(has_function_privilege('service_role', 'spin_wheel(uuid,uuid,text)', 'execute'),
  'ACL : service_role peut exécuter spin_wheel');

select * from finish();
rollback;
