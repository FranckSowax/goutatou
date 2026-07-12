-- Position GPS du restaurant (bot vivant § GPS sortant) : carte envoyée sur "infos"
-- quand ces deux colonnes sont renseignées. Nullables : null = pas de carte (comportement
-- actuel inchangé).
alter table restaurants
  add column location_lat double precision,
  add column location_lng double precision;

-- Interrupteur du canal (bouton on/off admin) : le statut 'disabled' n'était pas
-- admis par la contrainte d'origine (active/error) — l'update échouait en 500.
alter table whapi_channels drop constraint whapi_channels_status_check;
alter table whapi_channels add constraint whapi_channels_status_check
  check (status in ('active', 'error', 'disabled'));
