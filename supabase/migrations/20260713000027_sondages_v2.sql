-- Sondages v2 (spec docs/superpowers/specs/2026-07-13-sondages-v2-design.md) : un même sondage
-- natif publiable sur plusieurs surfaces (chaîne, groupe staff, statut-teaser). On remplace le
-- pilotage mono-`target` par un tableau `surfaces`, on garde `target` pour compat historique
-- (lignes 'channel'/'optin' déjà en base, consommées telles quelles par le worker), et on stocke
-- l'id du message natif par surface pour relire les votes (readPollResults). Idempotente.
alter table polls add column if not exists surfaces text[] not null default '{}';
alter table polls add column if not exists channel_message_id text;
alter table polls add column if not exists group_message_id text;
alter table polls add column if not exists teaser_image_url text;
alter table polls add column if not exists status_id uuid references statuses(id) on delete set null;
alter table polls add column if not exists surface_status jsonb not null default '{}'::jsonb;

-- Migration douce : les lignes historiques target='channel' sans surfaces renseignées deviennent
-- surfaces=['channel'] (le worker garde par ailleurs un fallback équivalent pour les lignes non
-- migrées, cf. Task SV2).
update polls set surfaces = array['channel'] where target = 'channel' and surfaces = '{}';

notify pgrst, 'reload schema';
