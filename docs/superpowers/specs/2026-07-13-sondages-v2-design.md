# Spec — Sondages v2 (multi-surfaces + dépouillement)

Date : 2026-07-13. Branche : `feature/sondages-v2`.

## Problème / intention

Le Sondages actuel (chantier P) envoie déjà des **sondages WhatsApp natifs** (`sendPoll`/`sendQuiz`)
vers une **surface unique** au choix : `channel` (la chaîne) ou `optin` (chaque client opt-in). Franck
veut élargir : un même sondage doit pouvoir viser **plusieurs surfaces**, et couvrir la demande
« en statut » — sachant qu'un sondage natif ne peut PAS être intégré dans un statut/story (les statuts
n'acceptent que texte/image/vidéo, jamais un vote natif ; même limite que les boutons sur la chaîne).

Décision produit (Franck) :
- **Surfaces retenues** : `channel` (natif), `group` (staff, natif), `status_teaser`
  (statut renvoyant vers le vote de la chaîne). **`optin` retiré** de la v2 (volume/anti-ban ;
  la colonne reste tolérée pour les lignes historiques mais n'est plus proposée à la création).
- **Dépouillement** : afficher les résultats des votes dans le web (à la demande, via `readPollVotes`).
- **Statut-teaser** : **texte auto par défaut**, avec **image optionnelle** uploadée par le gérant.

## Réalité technique (contrainte structurante)

- Sondage natif = **message** (`POST /messages/poll`, `sendPoll`) → destinataire = chat / groupe /
  chaîne (`@newsletter`). Lecture des votes : `readPollVotes(messageId)` (déjà en place, utilisé pour
  la validation groupe des statuts).
- **Statut/story** = texte/image/vidéo uniquement. **Aucun sondage natif dans un statut.** Le
  `status_teaser` est donc un statut qui *annonce* le sondage et *renvoie* vers la chaîne (là où le
  vote natif existe) via le lien d'invitation de la chaîne. Cocher `status_teaser` **force** `channel`
  (sinon il n'y a aucune surface votable à annoncer).

## Modèle de données (migration 0027)

Évolution de la table `polls` :

```sql
-- Multi-surfaces : sous-ensemble de {'channel','group','status_teaser'}.
alter table polls add column if not exists surfaces text[] not null default '{}';

-- Ids des messages natifs envoyés, par surface, pour relire les votes (dépouillement).
alter table polls add column if not exists channel_message_id text;
alter table polls add column if not exists group_message_id text;

-- Statut-teaser : contenu optionnel (image uploadée). Le texte est composé par le worker.
alter table polls add column if not exists teaser_image_url text;
alter table polls add column if not exists status_id uuid references statuses(id) on delete set null;

-- Suivi d'envoi par surface (une surface peut réussir et une autre échouer) : jsonb
-- { channel: 'sent'|'failed'|'skipped', group: ..., status_teaser: ... } — lisible dans l'historique.
alter table polls add column if not exists surface_status jsonb not null default '{}'::jsonb;

-- Migration douce des lignes existantes : target 'channel' → surfaces {'channel'} ; 'optin' laissé tel
-- quel dans `target` (non re-proposé), surfaces vide.
update polls set surfaces = array['channel'] where target = 'channel' and surfaces = '{}';

notify pgrst, 'reload schema';
```

- `target` (colonne existante `'channel'|'optin'`) **conservée** pour compat (contrainte CHECK inchangée),
  mais la v2 pilote l'envoi par `surfaces`. La création v2 écrit toujours `target='channel'` (valeur
  neutre satisfaisant la contrainte) et remplit `surfaces`.
- `status_id` relie le sondage au statut-teaser créé (table `statuses`), pour cohérence/traçabilité.

## Publication (poll-worker étendu)

Le worker existant `poll-worker` (claim-first `queued → sending → sent/failed`) est étendu pour
parcourir `surfaces` au lieu de brancher sur `target` :

- **`channel`** : `sendPoll(waChannelId, question, options)` (ou `sendQuiz` si `quiz_correct` non nul —
  si le quiz n'est pas rendu correctement sur la chaîne, repli `sendPoll`). Stocke `channel_message_id`.
  Canal/chaîne absents → `surface_status.channel='failed'`.
- **`group`** : `sendPoll(staffGroupId, question, options)`. Stocke `group_message_id`. Groupe absent →
  `surface_status.group='failed'`.
- **`status_teaser`** : compose le texte
  `📊 {question}\n\nVotez sur notre chaîne 👉 {invite_chaîne}` puis publie un **statut** :
  - si `teaser_image_url` fourni → `postStatusMedia(image, légende)` ;
  - sinon → `postStatusText(texte)`.
  Insère/relie une ligne `statuses` (kind image/text, state 'scheduled' immédiat ou publication directe
  via le status worker — **réutiliser le chemin statuts existant** plutôt que publier en direct, pour
  bénéficier du worker/retry). `status_teaser` sans chaîne rattachée → `failed` (rien à annoncer).
- Statut global du poll : `sent` si ≥1 surface `sent`, `failed` si toutes échouent. `surface_status`
  garde le détail par surface. Best-effort : une surface qui échoue n'empêche pas les autres.

Le champ `sent_count` reste (nombre de surfaces envoyées avec succès, pour compat/affichage).

## Dépouillement (web, à la demande)

Pas de nouveau worker. Dans l'onglet Sondages :
- Un bouton **« Voir les résultats »** par sondage → Server Action qui, pour chaque surface votable
  (`channel_message_id`, `group_message_id` non nuls), charge le token chaîne (`loadChannelToken`) et
  appelle `readPollVotes(messageId)`. `readPollVotes` renvoie aujourd'hui `{yes, no}` (spécialisé
  Oui/Non) : **l'étendre** à un décompte générique par option (`{ [optionLabel]: count }`) — voir
  packages/whapi. Le web affiche le **décompte par option et par surface** (barres simples, réutiliser
  les primitives charts SVG existantes de /app/stats si pertinent).
- Le `status_teaser` n'a pas de votes propres (le vote est sur la chaîne) : on n'affiche pas de résultats
  pour cette surface, seulement l'état d'envoi.

## Web (onglet Sondages refondu)

- **Composer** : question + options (2–12, réutiliser la validation existante) + quiz optionnel +
  bloc **« Surfaces »** (3 cases : Chaîne / Groupe staff / Statut teaser). Si « Statut teaser » coché,
  « Chaîne » est auto-coché et verrouillé (avec libellé explicatif). Champ image optionnel pour le
  teaser (upload DIRECT navigateur→bucket `status-media`, jamais de Server Action fichier — pattern
  statuts/chaîne). Bouton Publier.
- **Historique** : liste des sondages avec, par surface, l'état d'envoi (`surface_status`) + bouton
  « Voir les résultats » (dépouillement à la demande).

## Composants & isolement

- `packages/whapi` : `readPollVotes` étendu (décompte générique par option, rétrocompat `{yes,no}`
  conservé ou dérivé).
- `services/whatsapp/src/polls/{repo,worker}.ts` : boucle multi-surfaces, stockage des message ids,
  chemin teaser (réutilise le status worker / repo statuts).
- `apps/web/src/app/app/marketing/sondages/{composer,actions,page}.tsx` : cases surfaces + upload
  teaser + dépouillement. Helpers purs (validation surfaces, « teaser force channel ») dans un
  `shared.ts` testé.

## Tests

- whapi : `readPollVotes` générique (parse multi-options).
- bot : worker multi-surfaces (channel/group/teaser envoyés ; une surface échoue → autres OK ;
  `surface_status` correct ; teaser sans chaîne → failed ; ids stockés).
- web : helpers purs surfaces (teaser force channel ; au moins 1 surface requise).

## Hors périmètre (v2)

- Surface `optin` (retirée) ; planification des sondages ; sondages auto/récurrents ; worker de
  dépouillement périodique (on lit à la demande). À rouvrir si besoin plus tard.

## Déploiement

Migration 0027 via MCP + `notify pgrst` ; merge main ; Railway bot ; Netlify. Smoke Franck : créer un
sondage multi-surfaces sur Chez Démo, vérifier chaîne + groupe + statut-teaser, puis « Voir les
résultats » après quelques votes.
