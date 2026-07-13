begin;
select plan(9);

-- Fixtures : resto
insert into restaurants (id, slug, name) values
  ('70000000-0000-0000-0000-000000000001', 'resto-validation-statuts', 'Resto Validation Statuts');

-- 1. enum status_state contient désormais 'pending_approval'
select results_eq(
  $$select 'pending_approval' = any(enum_range(null::status_state)::text[])$$,
  array[true],
  'enum status_state contient pending_approval');

-- 2-4. nouvelles colonnes statuses
select has_column('public', 'statuses', 'approval_message_id', 'colonne approval_message_id existe sur statuses');
select has_column('public', 'statuses', 'approval_requested_at', 'colonne approval_requested_at existe sur statuses');
select has_column('public', 'statuses', 'auto_generated', 'colonne auto_generated existe sur statuses');

-- 5. auto_generated : défaut false
insert into statuses (id, restaurant_id, kind, content) values
  ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'text', 'Statut par défaut');
select results_eq(
  $$select auto_generated from statuses where id = '70000000-0000-0000-0000-000000000002'$$,
  array[false],
  'auto_generated vaut false par défaut');

-- 6-7. nouvelles colonnes restaurants
select has_column('public', 'restaurants', 'auto_status_validation', 'colonne auto_status_validation existe sur restaurants');
select has_column('public', 'restaurants', 'auto_status_manager_phone', 'colonne auto_status_manager_phone existe sur restaurants');

-- 8. auto_status_validation : défaut 'none'
select results_eq(
  $$select auto_status_validation from restaurants where id = '70000000-0000-0000-0000-000000000001'$$,
  array['none'],
  'auto_status_validation vaut ''none'' par défaut');

-- 9. auto_status_validation : contrainte check rejette une valeur hors énum
select throws_like(
  $$update restaurants set auto_status_validation = 'boss' where id = '70000000-0000-0000-0000-000000000001'$$,
  '%violates check constraint%',
  'auto_status_validation rejette une valeur hors (none, manager, group)');

select * from finish();
rollback;
