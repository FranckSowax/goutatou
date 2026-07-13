-- Validation des statuts auto (gérant / groupe) — spec
-- docs/superpowers/specs/2026-07-13-validation-statuts-design.md.
-- Nouvel état 'pending_approval' sur status_state (enum PG, cf. 20260709000012_statuses.sql) :
-- ALTER TYPE ... ADD VALUE seule dans ce fichier, aucune ligne de cette migration ne référence
-- la nouvelle valeur — évite l'erreur "unsafe use of new value of enum type" (une valeur ajoutée
-- ne peut pas être utilisée dans la même transaction qui l'ajoute).
alter type status_state add value if not exists 'pending_approval';

-- statuses : traçabilité de la demande de validation (message boutons gérant OU sondage groupe)
-- + distinction statuts auto-générés (seuls concernés par la validation) vs manuels.
alter table statuses
  add column approval_message_id text,
  add column approval_requested_at timestamptz,
  add column auto_generated boolean not null default false;

-- restaurants : mode de validation avant publication auto (Aucune / Gérant / Groupe staff) +
-- numéro du gérant validateur (mode 'manager' ; défaut = contact_phone si absent, résolu côté
-- worker bot).
alter table restaurants
  add column auto_status_validation text not null default 'none'
    check (auto_status_validation in ('none', 'manager', 'group')),
  add column auto_status_manager_phone text;
