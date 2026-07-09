begin;
select plan(6);

-- Limite 2 sur une fenêtre de 60 s.
select ok((select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 1 autorisé');
select ok((select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 2 autorisé (= limite)');
select ok(not (select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 3 bloqué (> limite)');
select ok((select retry_after from hit_rate_limit('k:a', 2, 60)) > 0, 'retry_after > 0 quand bloqué');

-- Une clé distincte n'est pas affectée par les hits de k:a.
select ok((select allowed from hit_rate_limit('k:b', 2, 60)), 'clé distincte indépendante');

-- Comptage persistant en table.
select ok(
  (select count from rate_limit_hits where key = 'k:a') >= 3,
  'compteur k:a >= 3 en table'
);

select * from finish();
rollback;
