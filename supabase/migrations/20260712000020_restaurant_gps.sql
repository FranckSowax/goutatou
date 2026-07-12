-- Position GPS du restaurant (bot vivant § GPS sortant) : carte envoyée sur "infos"
-- quand ces deux colonnes sont renseignées. Nullables : null = pas de carte (comportement
-- actuel inchangé).
alter table restaurants
  add column location_lat double precision,
  add column location_lng double precision;
