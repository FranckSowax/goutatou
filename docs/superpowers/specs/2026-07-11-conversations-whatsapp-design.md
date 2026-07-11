# Conversations WhatsApp — Design

Date : 2026-07-11
Statut : validé (Franck : lecture seule + lien WhatsApp, realtime oui)

## Intention

Le restaurateur suit toutes les conversations du bot WhatsApp depuis le dashboard
(`/app/conversations`, nouvelle entrée sidebar). Lecture seule en V1 : pour répondre,
un bouton « Ouvrir dans WhatsApp » (wa.me) bascule sur l'app. V2 possible plus tard :
réponse depuis le dashboard (token canal + bascule HUMAIN).

## Source de vérité : message_logs (DB), pas Whapi

Le bot journalise déjà chaque message in/out dans `message_logs` (restaurant_id,
direction in/out, chat_id, body, whapi_message_id, error, created_at ; RLS
`tenant_all_logs`). La page lit via le client membre (RLS) — aucun token Whapi côté
web, aucune dépendance à la disponibilité du canal.

Limite assumée : seuls les messages passés par le bot apparaissent (100 % du trafic
bot actuel, texte). Les réponses manuelles du restaurateur depuis son téléphone
n'y figurent pas → wa.me pour l'historique complet.

## UI `/app/conversations`

- Sidebar : « Conversations » (icône bulle lucide), entre Commandes et Menu.
- Desktop : deux volets — liste des conversations à gauche, fil à droite.
  Mobile 375px : liste plein écran → fil (retour).
- Liste : 1 item par chat_id — nom client (jointure `customers` par chat_id,
  fallback téléphone formaté), extrait du dernier message, heure relative,
  pastille « non lu » si dernier message entrant postérieur à la dernière
  consultation (suivi localStorage `gtt-conv-seen`, pas de migration).
- Fil : bulles client (gauche, bg-card) / bot (droite, teinte primaire),
  horodatage, indicateur « non délivré » si `error` non nul.
  Bouton « Ouvrir dans WhatsApp » (helper téléphone/wa.me existant de lib/lp/wa).
- Realtime : abonnement INSERT sur message_logs filtré restaurant_id
  (pattern kanban/notifications existant) → liste et fil se mettent à jour.

## Données & garde-fous

- Chargement initial serveur : messages des 30 derniers jours, limit 800
  (plafond PostgREST max_rows=1000 documenté — pas de troncature silencieuse
  au-delà : les plus récents d'abord), tri created_at desc puis regroupement.
- Helpers purs TDD `apps/web/src/lib/conversations.ts` :
  `groupConversations(logs, customers)` → [{chatId, customerName, phone,
  lastBody, lastAt, lastDirection, unreadCandidate}] triées par lastAt desc ;
  `threadFor(logs, chatId)` → messages asc.
- Migration 0016 : `alter publication supabase_realtime add table message_logs;`
  + `create index message_logs_resto_created_idx on message_logs (restaurant_id, created_at desc);`
- Aucun changement bot. Tokens light+dark, textes FR, gate web complet.

## Vérification

Tests helpers purs (groupement, tri, fallback nom, thread asc, extraits).
QA contrôleur en preview (Chez Demo a des message_logs ? sinon seed local/mock),
light+dark+375px. Revue finale inline (petit chantier) puis migration prod 0016
+ merge main + smoke.
