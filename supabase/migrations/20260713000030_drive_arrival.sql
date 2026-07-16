-- Cuisine Live — arrivée Drive (cf. docs/superpowers/plans/2026-07-13-cuisine-live.md, Task CL1).
-- Ajoute le signal d'arrivée client sur les commandes Drive : `arrived_at` (horodatage, mis à jour
-- une seule fois par le bot via markArrived, idempotent) et `arrival_note` (détail libre optionnel,
-- ex. "Toyota blanche"). Ne remplace rien d'existant (drive_slots, order_mode='drive' déjà en place).
-- Idempotente.
alter table orders add column if not exists arrived_at timestamptz;
alter table orders add column if not exists arrival_note text;

notify pgrst, 'reload schema';
