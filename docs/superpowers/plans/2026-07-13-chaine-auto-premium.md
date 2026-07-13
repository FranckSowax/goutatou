# Plan — Chaîne Auto premium (chantier 1)

Branche : `feature/chaine-auto` — migration `20260713000026`.

## Contexte & décisions de conception

La Chaîne Auto est le **pendant chaîne des Statuts Auto** (Studio Statuts / Validation Statuts).
Elle calque volontairement la verticale `autostatus/*` du bot (worker de génération LEAD-120 +
worker de publication + worker de décision groupe) mais publie sur la **chaîne WhatsApp** (newsletter)
au lieu du statut/story. La duplication de structure est **assumée et isolée** : elle ne touche
aucun chemin des statuts déjà déployés (régression nulle), et chaque brique reste testable seule.

Périmètre validé par Franck (les 4 briques) :
1. **Post quotidien du menu** — génération auto quotidienne d'un/plusieurs post(s) chaîne (photo +
   légende variée, rotation du menu, 1-2 créneaux/jour).
2. **Écho statut → chaîne** — option « publier aussi sur la chaîne » sur le composer de statut.
3. **Bouton « Commander »** — CTA cliquable vers le bot dans la légende.
4. **Programmation de posts** — composer un post chaîne à publier à une date/heure future.

### Décisions techniques figées (contraintes globales)

- **Pas de vrais boutons interactifs sur la chaîne.** Les chaînes WhatsApp (newsletters) n'acceptent
  pas les quick-reply/URL buttons (réservés aux chats 1:1 — vérifié sur la verticale X/boutons). Le
  « bouton Commander » est donc un **lien wa.me appended dans la légende** :
  `\n👉 Commander : https://wa.me/<digits>` où `<digits>` = `restaurants.contact_phone` nettoyé
  (chiffres seuls). Si `contact_phone` est absent/vide → **aucun lien ajouté** (pas d'erreur, la
  légende reste telle quelle). C'est un choix délibéré, pas un manque ; à revisiter si Whapi ouvre
  les boutons chaîne.
- **Validation réutilisée à l'identique.** La Chaîne Auto réutilise **les mêmes colonnes** que les
  Statuts Auto : `restaurants.auto_status_validation` ('none'|'manager'|'group'),
  `restaurants.auto_status_manager_phone`, `restaurants.staff_group_id`. **Aucune nouvelle colonne de
  validation.** Une seule politique de validation par resto, appliquée aux statuts auto ET à la chaîne
  auto. Sécurité identique : **sans validation/réponse à l'heure → annulé, jamais publié** (fail-closed
  sur tous les chemins, invariant repris de Validation Statuts).
- **Table `channel_posts` = source unique** des posts chaîne programmés ET auto. `auto_generated`
  distingue les deux. Les posts manuels immédiats (composer actuel `postChannelText/Image/...`) ne
  passent PAS par cette table (inchangés).
- **Horloge injectée** partout (`now: () => Date`), jamais `Date.now()` en dur (contrat de test repris
  des workers existants). Fuseau Africa/Libreville = UTC+1 fixe (helpers `librevilleParts`/`slotToUtcIso`
  identiques à `autostatus/worker.ts`).
- **`notify pgrst, 'reload schema'`** obligatoire après tout DDL (sinon PostgREST 400/500 opaque).
- **Best-effort d'envoi** : un échec Whapi individuel est logué (`console.error`), jamais bloquant pour
  les autres posts/lots du même tick.
- **FR partout** (copies utilisateur), messages d'erreur FR figés.
- Gating : la Chaîne Auto premium est réservée au plan **premium** (comme les Statuts Auto —
  `subscriptions.plan='premium'` actif). Le composer/programmation chaîne reste **Pro** (inchangé).

### Convention ids boutons validation chaîne (mode gérant)

Parallèle strict aux statuts (`stapp:`/`strej:`/`streg:`/`stcan:`), préfixe **`ch`** :
- `chapp:<postId>` → approuver, `chrej:<postId>` → refuser,
- `chreg:<postId>` → régénérer, `chcan:<postId>` → annuler.

---

## Schéma (migration 0026)

```sql
-- 1) Table des posts chaîne programmés + auto
create table if not exists channel_posts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null check (kind in ('text','image','video','menu_card','poll')),
  content text not null default '',
  media_url text,
  poll_options jsonb,
  scheduled_at timestamptz not null,
  state text not null default 'scheduled'
    check (state in ('scheduled','pending_approval','posting','posted','failed','canceled')),
  wa_message_id text,
  error text,
  auto_generated boolean not null default false,
  approval_message_id text,
  approval_requested_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists channel_posts_due_idx on channel_posts (state, scheduled_at);
create index if not exists channel_posts_resto_idx on channel_posts (restaurant_id, created_at desc);

alter table channel_posts enable row level security;
-- Lecture/écriture réservées aux membres du resto (pattern is_member repris des statuts).
create policy channel_posts_member_all on channel_posts
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- 2) Réglages Chaîne Auto (mirror auto_status_*, indépendants — toggle/horaires propres)
alter table restaurants add column if not exists auto_channel_enabled boolean not null default false;
alter table restaurants add column if not exists auto_channel_times text[] not null default '{}';
alter table restaurants add column if not exists auto_channel_count int not null default 1;
alter table restaurants add column if not exists auto_channel_cursor int not null default 0;
alter table restaurants add column if not exists auto_channel_last_slot text;

-- 3) Écho statut → chaîne
alter table restaurants add column if not exists auto_status_echo_channel boolean not null default false;
alter table statuses add column if not exists echo_to_channel boolean not null default false;

notify pgrst, 'reload schema';
```

RLS : `channel_posts` — SELECT/INSERT/UPDATE/DELETE membres via `is_member`. Le service bot écrit avec
la service_role (bypass RLS), comme les workers existants.

---

## Tâche CA1 — Migration 0026 + types partagés

**Fichiers** : `supabase/migrations/20260713000026_chaine_auto.sql` (nouveau) ;
`packages/db/src/types.ts` (édition).

1. Écrire la migration exactement comme le bloc SQL ci-dessus (table `channel_posts` + colonnes
   restaurants + `statuses.echo_to_channel` + `notify pgrst`). Idempotente (`if not exists`).
2. `packages/db/src/types.ts` :
   - `export type ChannelPostKind = 'text' | 'image' | 'video' | 'menu_card' | 'poll'`
   - `export type ChannelPostState = 'scheduled' | 'pending_approval' | 'posting' | 'posted' | 'failed' | 'canceled'`
   - Ajouter au type Restaurant (ou équivalent réglages) les champs `auto_channel_enabled`,
     `auto_channel_times`, `auto_channel_count`, `auto_channel_cursor`, `auto_channel_last_slot`,
     `auto_status_echo_channel` s'il existe un type Restaurant explicite ; sinon ne rien inventer
     (les repos lisent en colonnes brutes). Ajouter `echoToChannel?: boolean` là où les autres champs
     optionnels de statut sont déclarés SI un tel type existe.
   - **Ne PAS** appliquer la migration en prod dans cette tâche (déploiement = CA6). La tâche construit
     et type-check uniquement.
3. Tests : ce sont des ajouts de types + SQL — pas de test unitaire requis, mais `pnpm -C packages/db build`
   (ou tsc) doit passer.

**Contraintes** : noms de colonnes SQL exacts ; `notify pgrst` présent ; idempotence.

---

## Tâche CA2 — Web : programmation + Chaîne Auto + écho

**Fichiers** :
`apps/web/src/app/app/marketing/chaine/actions.ts` (édition — nouvelles actions),
`apps/web/src/app/app/marketing/chaine/auto-channel-card.tsx` (nouveau, client),
`apps/web/src/app/app/marketing/chaine/scheduled-list.tsx` (nouveau, client),
`apps/web/src/app/app/marketing/chaine/composer.tsx` (édition — bloc « Programmer » + case « bouton Commander »),
`apps/web/src/app/app/marketing/chaine/channel-data.ts` (édition — `loadScheduledPosts`, `loadAutoChannelSettings`),
`apps/web/src/app/app/marketing/chaine/page.tsx` (édition — monter les 2 sections, premium gating pour Auto),
`apps/web/src/app/app/marketing/statuts/composer.tsx` (édition — case « Publier aussi sur la chaîne »),
`apps/web/src/app/app/marketing/statuts/actions.ts` (édition — passer `echo_to_channel`),
`apps/web/src/app/app/marketing/statuts/auto-status-card.tsx` (édition — toggle « Écho chaîne par défaut »).

### Actions serveur (chaine/actions.ts)
Réutiliser le garde `myChannel()` existant (membre + plan Pro + wa_channel_id).

- `scheduleChannelPost(formData)` : champs `kind` ('text'|'image'|'menu_card'), `content`,
  `media_path` (image/menu_card, uploadée en DIRECT navigateur→bucket `status-media` — jamais de
  Server Action fichier, pattern existant), `caption`, `scheduled_at` (ISO). Valider :
  `scheduled_at` > maintenant (sinon « Choisissez une date future. ») ; pour image/menu_card
  `validateImagePath(media_path, restaurantId)`. Résoudre l'URL publique via
  `supabase.storage.from('status-media').getPublicUrl`. INSERT dans `channel_posts`
  (state 'scheduled', auto_generated false). `revalidatePath('/app/marketing/chaine')`.
  (v1 : text + image + menu_card seulement pour la programmation ; vidéo/poll hors scope programmation.)
- `cancelScheduledPost(formData)` : `post_id`. UPDATE `channel_posts` state='canceled'
  WHERE id=post_id AND restaurant_id=<mien> AND state='scheduled' (garde le tenant + l'état).
  revalidate.
- `saveAutoChannelSettings(formData)` : premium requis (`assertPlan(supabase, restaurantId, ['premium'])`).
  Champs : `enabled` (bool), `times` (liste "HH:MM", 1-2 valeurs, validées `^\d{2}:\d{2}$`),
  `count` (1-3). UPDATE restaurants. revalidate. Erreurs FR.

### auto-channel-card.tsx (client)
Section « Chaîne Auto » : toggle activé, champ horaires (1-2 créneaux "HH:MM"), nombre de posts (1-3).
Affiche (lecture seule) le mode de validation courant hérité des Statuts (« Validation : Aucune /
Gérant / Groupe staff — réglable dans Statuts ») pour rappeler la réutilisation. Bouton Enregistrer →
`saveAutoChannelSettings`. Ne PAS passer de fonction depuis un Server Component (RSC crash) : ce
composant est `'use client'` et importe l'action.

### scheduled-list.tsx (client)
Liste des posts programmés à venir (state 'scheduled', triés par scheduled_at) avec date FR
(`toLocaleString('fr-FR')`) + aperçu (kind + début du content) + bouton Annuler → `cancelScheduledPost`.

### composer.tsx (chaine) — bloc « Programmer »
Ajouter, pour les types text/image/menu_card, un champ date/heure optionnel + un bouton « Programmer »
à côté de « Publier ». Si une date est renseignée → `scheduleChannelPost` (au lieu de la publication
immédiate). Ajouter aussi une case **« Ajouter le bouton Commander »** (défaut coché) qui, quand cochée,
appende côté client `\n👉 Commander : https://wa.me/<digits>` à la légende/au corps AVANT envoi, où
`<digits>` vient d'une prop `contactPhone` (chiffres seuls). Si `contactPhone` vide → case masquée.
Le composant reçoit `contactPhone: string | null` en prop depuis page.tsx.

### page.tsx (chaine)
- Charger `contact_phone` du resto (SELECT étendu), le passer au Composer.
- Sous le composer : monter `<ScheduledList>` (data `loadScheduledPosts`) et — si premium —
  `<AutoChannelCard>` (data `loadAutoChannelSettings`). Le gating premium se lit via
  `subscriptions.plan='premium'` (helper existant `isPremium`/équivalent — vérifier le nom réel dans
  `@/lib/premium`, réutiliser).

### Écho statut → chaîne
- `statuts/composer.tsx` : ajouter une case **« Publier aussi sur la chaîne »** (par carte OU globale —
  choisir globale pour simplicité : un seul état `echoToChannel`). La valeur est passée à l'action.
- `statuts/actions.ts` : inclure `echo_to_channel: echoToChannel` dans l'INSERT des statuts manuels.
- `statuts/auto-status-card.tsx` + `statuts/actions.ts` (save auto settings) : toggle
  « Écho chaîne par défaut » → `auto_status_echo_channel` sur restaurants.

**Contraintes** : upload fichier TOUJOURS en direct navigateur→`status-media` (jamais Server Action
fichier — évite le 404 Server Action). Jamais de prop fonction Server→Client. Messages FR figés.
Réutiliser `validateImagePath` (chaine/shared.ts). Ne PAS régresser les publications immédiates existantes.

**Tests** : helpers purs éventuels dans `chaine/shared.ts` (ex. `validateScheduledAt(iso, nowIso)`)
testés dans `chaine/*.test.ts` si ajoutés. Les composants/actions ne sont pas testés unitairement
(pattern web existant), mais `pnpm -C apps/web build` + lint doivent passer.

---

## Tâche CA3 — Bot : génération quotidienne chaîne (autochannel worker)

**Fichiers** :
`services/whatsapp/src/autochannel/repo.ts` (nouveau),
`services/whatsapp/src/autochannel/captions.ts` (nouveau),
`services/whatsapp/src/autochannel/worker.ts` (nouveau),
`services/whatsapp/test/autochannel-worker.test.ts` (nouveau),
`services/whatsapp/test/autochannel-captions.test.ts` (nouveau).

### captions.ts
`buildChannelCaption(dish: {name; price}, templateIndex: number, contactPhone: string | null): string`.
Base = `buildStatusCaption` (réutiliser via import depuis `../autostatus/captions.js`) PUIS appende le
CTA Commander : si `contactPhone` non vide → `\n👉 Commander : https://wa.me/<digits>` (digits =
`contactPhone.replace(/\D/g,'')`), sinon rien. Pur, testé (avec et sans phone).

### repo.ts — `createAutoChannelRepo(db, tokenKey?)`
Mirror de `autostatus/repo.ts` mais table `channel_posts` et colonnes `auto_channel_*` :
- `listCandidates()` : restaurants avec `auto_channel_enabled=true`, `subscriptions!inner(plan='premium',
  status='active')`, `whapi_channels!inner(status='active')`, ET `wa_channel_id` non nul. Sélectionner
  `id, name, contact_phone, wa_channel_id, auto_channel_times, auto_channel_count, auto_channel_cursor,
  auto_channel_last_slot, auto_status_validation, auto_status_manager_phone, staff_group_id`.
  Renvoie un `AutoChannelCandidate` (champs camelCase équivalents + `waChannelId`, `contactPhone`).
- `claimSlot(restaurantId, slotKey, previousLastSlot)` : claim conditionnel sur
  `auto_channel_last_slot` (identique à autostatus).
- `getPhotoDishes(restaurantId)` : **réutiliser** `createAutoStatusRepo(db).getPhotoDishes` (même
  rotation menu) — importer et déléguer, ne pas dupliquer la requête.
- `bumpCursor(restaurantId, nextCursor)` : `auto_channel_cursor`.
- `insertScheduledPosts(rows)` : INSERT `channel_posts` kind='image', state='scheduled',
  auto_generated=true (mode 'none').
- `insertPendingApprovalPosts(rows)` : INSERT state='pending_approval', auto_generated=true → renvoie
  `{id, content, mediaUrl}[]`.
- `getChannel(restaurantId)` : token déchiffré + status (comme autostatus).
- `markFailed(id, error)` ; `markApprovalRequested(ids, approvalMessageId, requestedAtIso)`.
Row type `NewChannelPostRow = { restaurantId; content; mediaUrl; scheduledAt }`.

### worker.ts — `runAutoChannelOnce(deps)` + `startAutoChannelWorker(deps)`
Structure **identique** à `autostatus/worker.ts` :
- `AUTO_CHANNEL_LEAD_MIN = 120`, helpers `librevilleParts`/`toMinutes`/`slotToUtcIso` (copier les mêmes,
  fuseau UTC+1 fixe).
- Un seul créneau par tick (le plus récent dû, `now >= créneau - 120min`), skip `slotKey <= lastSlot`,
  claim conditionnel, sinon continue.
- Génère `count` posts en rotation cursor sur `getPhotoDishes`, `content = buildChannelCaption(dish,
  cursor+i, c.contactPhone)`, `mediaUrl = dish.photoUrl`, `scheduledAt = slotToUtcIso(...)`.
- `dispatchGenerated(c, rows, nowIso, deps)` mirror : mode 'none' → `insertScheduledPosts` ; mode
  'manager' → `insertPendingApprovalPosts` puis par post : image envoyée au numéro gérant
  (`auto_status_manager_phone ?? contact_phone`) + **boutons** `chapp:<id>` / `chrej:<id>`
  (question « Publier ce post chaîne ? », labels « ✅ Valider » / « ❌ Refuser »), puis
  `markApprovalRequested`. Numéro absent → chaque post `markFailed('Renseignez le numéro du gérant
  validateur.')`. mode 'group' → `insertPendingApprovalPosts`, image de chaque post au groupe staff,
  puis **UN SEUL sondage** « 📣 Publier les N posts chaîne du jour ? » ['Oui','Non'], `markApprovalRequested`.
  Groupe absent → `markFailed("Créez d'abord le groupe Cuisine.")`. Canal indisponible → log, return.
  `makeWhapi` type : `Pick<WhapiClient, 'sendImage' | 'sendQuickReplies' | 'sendPoll'>`.

**Tests** (vitest, mocks repo + makeWhapi, `now` injecté) :
- créneau non dû (avant lead-120) → aucune génération ;
- créneau dû mode 'none' → `insertScheduledPosts` appelé avec N rows, scheduledAt = créneau UTC ;
- mode 'manager' avec numéro → image + `sendQuickReplies` avec ids `chapp:`/`chrej:` + markApprovalRequested ;
- mode 'manager' sans numéro → markFailed FR, aucun envoi ;
- mode 'group' → N images + 1 sondage + markApprovalRequested(tous les ids) ;
- `slotKey <= lastSlot` → skip (pas de double génération) ;
- captions : avec phone → suffixe wa.me ; sans phone → base seule.

**Contraintes** : réutiliser getPhotoDishes d'autostatus (pas de duplication de la requête menu).
`now` injecté. LEAD 120. Un seul créneau/tick. ids `chapp:`/`chrej:` EXACTS.

---

## Tâche CA4 — Bot : publication chaîne + décision groupe + écho

**Fichiers** :
`services/whatsapp/src/channelposts/repo.ts` (nouveau),
`services/whatsapp/src/channelposts/worker.ts` (nouveau),
`services/whatsapp/src/autochannel/decision-repo.ts` (nouveau),
`services/whatsapp/src/autochannel/decision-worker.ts` (nouveau),
`services/whatsapp/src/statuses/worker.ts` (édition — écho après publication),
`services/whatsapp/src/statuses/repo.ts` (édition — lire echo_to_channel + wa_channel_id + poster chaîne),
tests : `channelposts-worker.test.ts`, `autochannel-decision-worker.test.ts` (nouveaux),
mise à jour `statuses-worker.test.ts` si besoin (rétrocompat).

### channelposts/repo.ts — `createChannelPostsRepo(db, tokenKey)`
- `cancelExpiredPendingApproval(nowIso)` : posts `channel_posts` state='pending_approval',
  `restaurants.auto_status_validation='manager'` (jointure !inner), `scheduled_at<=now` →
  state='canceled', error='Non validé à temps — non publié.' (sécurité fail-closed, mirror statuts).
- `claimDue(nowIso)` : passe 'scheduled' échus (`scheduled_at<=now`) en 'posting', puis SELECT les
  'posting' → `{id, restaurantId, kind, content, mediaUrl, pollOptions, waChannelId}` (jointure
  restaurants pour `wa_channel_id`). (Ne réclame QUE les posts dont le resto a un wa_channel_id.)
- `getChannel(restaurantId)` : token + status.
- `markPosted(id, waMessageId)` ; `markFailed(id, error)`.

### channelposts/worker.ts — `processChannelPostOnce(post, deps)` + `runChannelPostsWorkerOnce` + `startChannelPostsWorker`
`makeWhapi: Pick<WhapiClient, 'sendNewsletterText' | 'sendNewsletterImage' | 'sendChannelVideo' | 'sendPoll'>`.
- Canal inactif → markFailed('canal inactif').
- Selon kind : 'text' → `sendNewsletterText(waChannelId, content)` ; 'image'|'menu_card' →
  `sendNewsletterImage(waChannelId, mediaUrl, content||undefined)` ; 'video' →
  `sendChannelVideo(waChannelId, mediaUrl, content||undefined)` ; 'poll' →
  `sendPoll(waChannelId, content, pollOptions)`. markPosted(res.id). try/catch → markFailed(String(err)).
- `runChannelPostsWorkerOnce` : `cancelExpiredPendingApproval` PUIS `claimDue` PUIS boucle publish.
  (Mirror exact de `statuses/worker.ts` runStatusWorkerOnce — l'ordre garantit qu'un post en attente
  expiré ne soit jamais publié.)

### autochannel/decision-repo.ts + decision-worker.ts
Mirror strict de `autostatus/decision-repo.ts` + `decision-worker.ts` mais table `channel_posts` :
- `listDueGroupBatches(nowIso)` : `channel_posts` state='pending_approval', auto_generated=true,
  `restaurants.auto_status_validation='group'`, approval_message_id non nul, `scheduled_at<=now`,
  regroupés par approval_message_id.
- `approveBatch(ids)` → state='scheduled' ; `cancelBatch(ids, error)` → state='canceled'.
- worker : lit `readPollVotes(approvalMessageId)`, `yes>no && yes>=1` → approveBatch, sinon cancelBatch
  (error='Non validé par le groupe.'). Canal indisponible → cancelBatch. Best-effort par lot.

### Écho statut → chaîne (statuses/worker.ts + repo.ts)
- `statuses/repo.ts` `claimDue` : sélectionner en plus `echo_to_channel` et, via jointure restaurants,
  `wa_channel_id`. Ajouter au type `DueStatus` : `echoToChannel?: boolean`, `waChannelId?: string | null`.
- `statuses/worker.ts` `processStatusOnce` : APRÈS `markPosted` réussi, si `s.echoToChannel &&
  s.waChannelId` → best-effort poster sur la chaîne via le MÊME token
  (`makeWhapi` étendu à `'sendNewsletterImage' | 'sendNewsletterText'`) : si `mediaUrl` →
  `sendNewsletterImage(waChannelId, mediaUrl, content||undefined)`, sinon
  `sendNewsletterText(waChannelId, content)`. Échec écho logué (`console.error('[status-echo]', err)`),
  **jamais** de markFailed (le statut lui-même est déjà publié avec succès). Ne pas modifier le contrat
  de test existant pour les statuts SANS écho (echoToChannel absent/false → comportement byte-identique).

**Tests** :
- channelposts : text/image/video/poll → bonne méthode Whapi + markPosted ; canal inactif → markFailed ;
  pending_approval manager expiré → canceled avant claimDue (aucune publication) ; échec Whapi → markFailed.
- decision : yes>no → approveBatch ; égalité/no≥yes/0 vote → cancelBatch ; canal indispo → cancelBatch.
- écho : statut avec echoToChannel+waChannelId → sendNewsletterImage/Text appelé après markPosted ;
  échec écho → statut reste 'posted' (pas de markFailed) ; sans écho → aucun appel chaîne (rétrocompat).

**Contraintes** : ordre cancelExpired→claimDue→publish (fail-closed). Écho best-effort non bloquant.
Rétrocompat stricte des tests statuts existants. Copies FR exactes.

---

## Tâche CA5 — Bot : boutons validation chaîne (processor) + câblage

**Fichiers** :
`services/whatsapp/src/autochannel/approval.ts` (nouveau — parsing + copies FR),
`services/whatsapp/src/autochannel/approval-repo.ts` (nouveau),
`services/whatsapp/src/processor.ts` (édition — intercepter `chapp:`/`chrej:`/`chreg:`/`chcan:`),
`services/whatsapp/src/index.ts` (édition — câbler autochannel worker + channelposts worker + decision worker),
`services/whatsapp/src/config.ts` (édition — `autoChannelPollMs`, `channelPostsPollMs` avec défauts),
tests : `autochannel-approval.test.ts`, `processor-channel-approval.test.ts` (nouveaux).

### approval.ts
`parseChannelApprovalButton(id)` : préfixes `chapp:`/`chrej:`/`chreg:`/`chcan:` → `{action, postId}`
(mirror `parseApprovalButton`). Réutiliser `isManagerSender` depuis `../autostatus/approval.js`
(export existant — importer, ne pas dupliquer). Copies FR `CHANNEL_APPROVAL_COPY` (parallèles à
`APPROVAL_COPY` : approved='✅ Post chaîne validé — publication à l'heure prévue.', etc.).

### approval-repo.ts — `createChannelApprovalRepo(db)`
Mirror `autostatus/approval-repo.ts` sur `channel_posts` :
- `getPost(postId, restaurantId)` : SELECT id, restaurant_id, state, auto_generated, content, media_url,
  `restaurants(auto_status_manager_phone, contact_phone)` → `{..., managerPhone}` (filtre tenant dans
  la requête). null si autre resto.
- `approve(postId)` : state 'pending_approval'→'scheduled' (garde d'état). `cancel(postId)` :
  →'canceled' error='Refusé par le gérant.'. `regenerate(postId, content, mediaUrl)` : reste
  pending_approval. `getNextDish(restaurantId, currentMediaUrl)` : réutiliser
  `createAutoStatusRepo(db).getNextDish`… **non** — getNextDish est sur ApprovalRepo (autostatus),
  déléguer via `createApprovalRepo`? Plus simple : réutiliser `createAutoStatusRepo(db).getPhotoDishes`
  + la même logique de rotation (copier la petite fonction `getNextDish` — 4 lignes). La régénération
  chaîne réutilise `buildChannelCaption`.

### processor.ts
Avant le flux machine (comme les boutons statut `stapp:` etc.), intercepter les ids `chapp:`/`chrej:`/
`chreg:`/`chcan:` : `handleChannelApprovalButton(chatId, buttonId)`. Logique **identique** à
`handleApprovalButton` (statuts) mais via `channelApprovalRepo` + `CHANNEL_APPROVAL_COPY` +
`buildChannelCaption` pour la régénération :
- parse ; getPost ; si null → alreadyHandled/notAvailable ; si `!isManagerSender(chatId, managerPhone)`
  → notAvailable (durcissement identité gérant) ; approve → copy approved ; reject → liste/boutons
  Régénérer/Annuler (`chreg:`/`chcan:`) ; regen → getNextDish, si null noDishToRegenerate sinon
  regenerate + renvoyer image + boutons Valider/Refuser (`chapp:`/`chrej:`) ; cancel → canceled.
Le processor reçoit `channelApprovalRepo` dans ses deps (comme `approvalRepo`). Mode group : les votes
sont gérés par le decision worker, PAS ici (les boutons chapp/chrej ne concernent que le mode gérant).

### index.ts
Câbler : `createAutoChannelRepo(db, config.tokenKey)` + `startAutoChannelWorker({repo, makeWhapi:(t)=>new
WhapiClient(t), now:()=>new Date(), pollMs: config.autoChannelPollMs})` ;
`createChannelPostsRepo(db, config.tokenKey)` + `startChannelPostsWorker(...)` ;
`createChannelDecisionRepo(db, config.tokenKey)` + `startChannelDecisionWorker(...)` ;
`createChannelApprovalRepo(db)` passé au processor. Étendre le `makeWhapi` du status worker aux
méthodes newsletter (écho). Étendre le `makeWhapi` du processor si nécessaire (déjà `new WhapiClient`).

### config.ts
`autoChannelPollMs` (défaut = `autoStatusPollMs`, ex. 60000), `channelPostsPollMs` (défaut =
`statusPollMs`). Lire depuis env avec fallback.

**Tests** :
- approval : parse des 4 préfixes + id vide → null + non-préfixe → null ; copies présentes.
- processor-channel-approval : chapp → approve + copy ; chrej → boutons chreg/chcan ; chreg avec plat →
  regenerate + image + boutons ; chreg sans plat → noDishToRegenerate ; chcan → canceled ; émetteur ≠
  gérant → notAvailable, aucune écriture ; post d'un autre resto (getPost null) → notAvailable.

**Contraintes** : réutiliser `isManagerSender`. ids EXACTS. Ne pas régresser l'interception des boutons
statut existants (`stapp:` etc. doivent continuer de marcher — les nouveaux `ch*` sont testés à part et
n'interceptent que leur préfixe). `now` injecté côté workers.

---

## Tâche CA6 — Revue opus + prod + deploy + smoke

1. `pnpm -w test` (bot + web) vert ; `pnpm -w build` (ou par package) vert.
2. Revue finale opus (whole-branch) via review-package : cibler l'invariant **« aucune publication
   chaîne sans validation »** (fail-closed sur tous les chemins pending_approval → canceled), la
   non-régression des statuts/chaîne existants, et l'écho best-effort non bloquant. Corriger les
   findings Critical/Important en une vague.
3. Appliquer la migration 0026 en prod **via le MCP Supabase de service** (`apply_migration`), puis
   `execute_sql "notify pgrst, 'reload schema'"`. Vérifier le round-trip (INSERT/SELECT channel_posts,
   colonnes auto_channel_* lisibles).
4. Merge `feature/chaine-auto` → main (fast-forward), push.
5. Deploy Railway bot : `railway up --detach --service whatsapp-bot`. Vérifier les 3 nouveaux logs
   `[auto-channel] démarré`, `[channel-posts] démarré`, `[channel-decision] démarré` (12 services).
   Netlify auto-deploy depuis main.
6. Ledger `.superpowers/sdd/progress.md` + mémoire `goutatou-platform.md` mis à jour.
7. Smoke = Franck (publication réelle sur sa chaîne Chez Démo) : programmer un post à +5 min, vérifier
   la publication ; activer Chaîne Auto + créneau proche, recevoir la validation (gérant/groupe),
   valider, voir le post partir sur la chaîne ; cocher l'écho sur un statut, vérifier le double envoi.

## Global Constraints (rappel pour toutes les tâches)

- Migration `20260713000026`, colonnes/tables aux noms EXACTS ci-dessus, `notify pgrst` après DDL.
- Validation RÉUTILISE `auto_status_validation`/`auto_status_manager_phone`/`staff_group_id` — pas de
  nouvelle colonne de validation.
- ids boutons chaîne : `chapp:` / `chrej:` / `chreg:` / `chcan:` (préfixe `ch`, + postId).
- « Bouton Commander » = lien wa.me dans la légende (`\n👉 Commander : https://wa.me/<digits>`), jamais
  un vrai bouton interactif ; absent si contact_phone vide.
- Fail-closed : tout post pending_approval non validé à l'heure → canceled, jamais posté.
- Écho best-effort : jamais bloquant, jamais markFailed sur le statut.
- Horloge injectée (`now: () => Date`), UTC+1 fixe, LEAD 120 min, un seul créneau par tick.
- Upload fichier = direct navigateur→bucket `status-media` (jamais Server Action fichier).
- Jamais de prop fonction Server Component → Client Component (RSC crash prod).
- getPhotoDishes réutilisé d'`autostatus/repo.ts` (pas de duplication de la requête menu).
- `isManagerSender` réutilisé d'`autostatus/approval.ts`.
- FR partout, copies figées.
