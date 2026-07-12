-- Studio Statuts (spec docs/superpowers/specs/2026-07-12-studio-statuts-design.md, migration 0024) :
-- statuts vidéo, styles WhatsApp (fond/légende/police), ciblage VIP opt-in, réglages Statuts Auto.
-- Nom de contrainte vérifié en base locale (pg_constraint sur public.statuses) avant le drop :
-- "statuses_kind_check" (check inline non nommé sur la colonne kind, généré par Postgres).
alter table statuses drop constraint statuses_kind_check;
alter table statuses add constraint statuses_kind_check check (kind in ('text','image','video'));
alter table statuses
  add column bg_color text,
  add column caption_color text,
  add column font_type int,
  add column audience text not null default 'all' check (audience in ('all','optin'));
alter table restaurants
  add column auto_status_enabled boolean not null default false,
  add column auto_status_times jsonb not null default '[]',   -- ["11:30","18:30"] max 2, HH:MM Libreville
  add column auto_status_count int not null default 1 check (auto_status_count between 1 and 3),
  add column auto_status_cursor int not null default 0,        -- rotation plats
  add column auto_status_last_slot text;                       -- "YYYY-MM-DD HH:MM" dernier créneau exécuté
