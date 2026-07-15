-- Roue QR + action sociale (Fidélité v3, cf. docs/superpowers/plans/2026-07-13-roue-qr-sociale.md).
-- Remplace le déclenchement « après N commandes » par un flux public QR → action sociale
-- déclarative → 1 tour par numéro/période. `wheel_qr_public` bascule le comportement ;
-- à false, le flux v2 (déclenchement après N commandes) reste inchangé (non-régression).
-- Idempotente.
alter table restaurants add column if not exists wheel_qr_public boolean not null default false;
alter table restaurants add column if not exists wheel_google_url text;
alter table restaurants add column if not exists wheel_tiktok_url text;
alter table restaurants add column if not exists wheel_channel_url text;
alter table restaurants add column if not exists wheel_action_google boolean not null default false;
alter table restaurants add column if not exists wheel_action_tiktok boolean not null default false;
alter table restaurants add column if not exists wheel_action_channel boolean not null default false;
alter table restaurants add column if not exists wheel_spin_period_days int not null default 30;

alter table wheel_spins add column if not exists declared_action text
  check (declared_action in ('google','tiktok','channel'));
alter table wheel_spins add column if not exists source text not null default 'order'
  check (source in ('order','qr_public'));

notify pgrst, 'reload schema';
