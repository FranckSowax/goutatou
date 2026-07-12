# Sondages & quiz WhatsApp — Design

Date : 2026-07-12
Statut : validé (Franck : « feu sondages », item 5 du pipeline Marketing)

## Intention

Nouvel onglet Marketing « Sondages » : le resto compose un sondage (ou un quiz
avec bonne réponse) et l'envoie sur sa **chaîne WhatsApp** et/ou à ses **clients
opt-in marketing** (mot-clé PROMOS). Les résultats se consultent nativement dans
WhatsApp (les sondages y affichent les votes en direct) — le suivi des votes
dans le dashboard est un backlog v2 (webhook votes à cartographier).

## Modèle (migration 0022)

```sql
create table polls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  question text not null,
  options jsonb not null,               -- ["Oui","Non",...] 2 à 12 entrées
  quiz_correct int,                     -- null = sondage ; sinon index 0-based de la bonne réponse
  target text not null check (target in ('channel','optin')),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  sent_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table polls enable row level security;
create policy tenant_all_polls on polls for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
```

## whapi client

`sendPoll(to, question, options: string[])` (POST /messages/poll) et
`sendQuiz(to, question, options, correctIndex)` (POST /messages/quiz) —
endpoints/payloads à VÉRIFIER (doc skill, source whapi-mcp) ; limites WhatsApp
(12 options max) validées côté web.

## Worker bot `poll-worker`

- Poll POLL_WORKER_POLL_MS (défaut 30 s), claim-first (status queued → sending,
  pattern statuts), canal actif requis.
- target 'channel' : wa_channel_id requis (sinon failed + erreur FR
  « Créez d'abord votre chaîne WhatsApp. ») ; un seul envoi vers la chaîne ;
  sent_count = 1.
- target 'optin' : clients marketing_opt_in = true AND opted_out = false ;
  envoi par client, THROTTLE campagnes entre chaque, échec par client compté
  et loggé sans bloquer ; sent_count = envois réussis ; 0 client → failed
  avec erreur FR « Aucun client opt-in — faites scanner votre QR PROMOS. ».
- Fin : status sent + sent_at (ou failed + error FR). Quiz → sendQuiz.

## Web — onglet Marketing « Sondages » (gating Pro, comme chaîne/statuts)

- Composer : question (requise), options dynamiques (2 min, 12 max, ajout/
  suppression), switch « Quiz » (si actif : sélection de la bonne réponse),
  cible (radio : Chaîne WhatsApp / Clients opt-in (N)) — le compteur d'opt-in
  affiché ; submit → insert polls status queued + message FR « Envoi en cours —
  effectif sous une minute. ».
- Historique : liste des sondages (question, cible, statut badge, sent_count,
  date, erreur FR éventuelle), realtime non requis (refresh à la navigation).
- Garde membre, écritures via client membre (RLS polls) — pas de client admin.

## Hors scope (backlog)

Suivi des votes dans le dashboard (webhook poll votes), programmation différée,
relance, sondage en conversation bot (1-à-1 à la demande).

## Vérification

Tests whapi (2 méthodes), worker (channel/optin/quiz/0 client/échecs partiels/
claim), web (validation options min/max, quiz index), gates, revue, migration
prod, deploys. Smoke prod SANS envoi à des tiers : sondage cible optin avec 0
client opt-in → failed avec le message FR attendu (aucun message sortant) ;
test réel par Franck ensuite (PROMOS depuis son téléphone puis sondage).
