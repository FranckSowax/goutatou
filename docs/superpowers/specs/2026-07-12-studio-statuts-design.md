# Studio Statuts (vidéo, séries, preview, auto, VIP) — Design

Date : 2026-07-12
Statut : validé (Franck : « feu studio statuts » = Studio + Statuts Auto A + ciblage VIP C ; légendes IA = chantier 2 séparé)

## Intention

/app/marketing/statuts devient un studio : statuts **vidéo**, **séries
programmées**, **prévisualisation WhatsApp fidèle**, ciblage **VIP opt-in**,
et la section Premium **« Statuts Auto »** : publication quotidienne générée
depuis le Menu Studio (moteur de templates FR déterministe, rotation des plats).

## Migration 0024

```sql
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
```
(vérifier le nom exact de la contrainte kind dans 0012 avant le drop)

## whapi client (extensions des méthodes story existantes — champs CONFIRMÉS par le manifest)

- postStatusText(caption, opts?: { backgroundColor?, captionColor?, fontType?, contacts?: string[] })
- postStatusMedia(mediaUrl, mime, opts?: { caption?, contacts?: string[] }) — mime image/* OU video/mp4
  (signatures actuelles à lire : étendre SANS casser les appels du status worker).

## Bot

- **status worker** : kind 'video' → postStatusMedia mime video/mp4 ; styles texte
  (bg_color/caption_color/font_type) transmis ; audience 'optin' → charger les
  chat_ids opt-in (marketing_opt_in && !opted_out) → param contacts ; liste vide
  → failed FR « Aucun client opt-in pour ce statut VIP. ».
- **auto-status worker** (nouveau, `[auto-status] démarré`, poll 5 min) :
  restos premium actifs + auto_status_enabled + canal actif ; heure Libreville
  courante ≥ un créneau de auto_status_times non encore exécuté aujourd'hui
  (auto_status_last_slot, claim conditionnel) → générer auto_status_count
  statuts kind image : plats DISPONIBLES AVEC PHOTO en rotation (cursor,
  jamais 2× le même d'affilée), caption par moteur de templates pur
  `buildStatusCaption(dish, templateIndex)` (≥6 gabarits FR variés : accroche +
  plat + prix formatFcfa + CTA « 📲 Commandez-nous sur WhatsApp ! ») → INSERT
  statuses (state scheduled, scheduled_at=now, audience 'all') — le status
  worker existant publie. 0 plat avec photo → skip silencieux + log.

## Web (/app/marketing/statuts)

- **Composer multi-cartes** : pile de cartes (texte/image/vidéo), ajout/
  suppression ; par carte : contenu + styles texte (palette de fonds WhatsApp
  classiques + couleur légende + police 0-5) + audience (Tous / Clients opt-in 👑
  — gate premium sur l'option, tooltip sinon) ; envoi : « Publier maintenant à
  la suite » (scheduled_at étagés de 2 min) OU heure par carte. Vidéo : upload
  DIRECT navigateur→storage (pattern hero LP, bucket status-media existant,
  ≤16 Mo, mp4), jamais par Server Action.
- **Preview WhatsApp** : volet 9:16 sombre fidèle (texte : fond coloré plein
  cadre + légende centrée police choisie ; image : cover + légende bas ;
  vidéo : <video controls>) — dans le composer (carte active) et au clic d'un
  statut de l'historique (dialog).
- **Section « Statuts Auto » 👑** (premium, sinon upsell card pattern existant) :
  toggle, 1-2 créneaux HH:MM, X statuts/créneau (1-3), aperçu du prochain
  statut généré (photo + caption du moteur — même code partagé ? NON : le
  moteur est bot-side ; dupliquer le rendu caption en TS web léger comme
  bot-info-preview, avec le même contrat), dernier créneau exécuté.

## Hors scope

Légendes IA (chantier 2), statuts auto vidéo, stats de vues (getMessageViewStatuses — backlog).

## Vérification

Tests whapi (extensions), bot (worker video/style/audience/vide, auto-status :
créneau dû/déjà fait/rotation/0 photo/premium gate/claim), moteur captions pur
(variété, rotation), web (validation heures/quotas, upload direct). Revue opus
(nouveau worker + ciblage). Migration prod + notify pgrst, deploys, smoke :
auto-status forcé sur Chez Demo (créneau = maintenant) → statuts générés en
base + publiés sur le canal réel.
