begin;
select plan(8);

-- Fixtures : resto + user membre
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-00000000000a', 'poll-a@test.io');
insert into restaurants (id, slug, name) values
  ('70000000-0000-0000-0000-000000000001', 'resto-poll', 'Resto Poll');
insert into restaurant_members (user_id, restaurant_id) values
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001');

-- 1. table + colonnes clés
select has_table('public', 'polls', 'polls existe');
select has_column('public', 'polls', 'options', 'colonne options existe');
select has_column('public', 'polls', 'quiz_correct', 'colonne quiz_correct existe');

-- 2. RLS activée
select results_eq(
  $$select relrowsecurity from pg_class where relname = 'polls'$$,
  array[true],
  'RLS activée sur polls');

-- 3. policy présente
select results_eq(
  $$select count(*)::int from pg_policies where tablename = 'polls' and policyname = 'tenant_all_polls'$$,
  array[1],
  'policy tenant_all_polls présente');

-- 4. insert + visibilité via is_member (membre du resto)
insert into polls (id, restaurant_id, question, options, target) values
  ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'Quel plat préférez-vous ?', '["Poulet","Poisson"]'::jsonb, 'channel');

set local role authenticated;
set local request.jwt.claims to '{"sub": "70000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select results_eq(
  'select count(*)::int from polls',
  array[1],
  'membre du resto voit son sondage');
reset role;
reset request.jwt.claims;

-- 5. contrainte target : valeur invalide rejetée
select throws_like(
  $$insert into polls (restaurant_id, question, options, target) values ('70000000-0000-0000-0000-000000000001', 'Q', '["A","B"]'::jsonb, 'sms')$$,
  '%violates check constraint%',
  'target invalide rejetée par la contrainte check');

-- 6. contrainte status : valeur invalide rejetée
select throws_like(
  $$insert into polls (restaurant_id, question, options, target, status) values ('70000000-0000-0000-0000-000000000001', 'Q', '["A","B"]'::jsonb, 'channel', 'pending')$$,
  '%violates check constraint%',
  'status invalide rejeté par la contrainte check');

select * from finish();
rollback;
