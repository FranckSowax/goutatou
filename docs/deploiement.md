# Déploiement Goutatou — Phase 1

Ce document décrit le déploiement du socle (phase 1) : Supabase (DB/Auth/Realtime/Storage) + Railway (service bot Whapi) + Netlify (dashboard + admin). Les étapes marquées **[credentials]** nécessitent un accès authentifié (OAuth Supabase, compte Railway/Netlify, token Whapi réel) et se font depuis une session interactive.

## Architecture déployée

```
WhatsApp client ──► Whapi (canal par resto) ──webhook──► Railway: service-whatsapp
                                                              │  (API REST Whapi pour répondre)
                                                              ▼
                                                        Supabase Postgres
                                                        (RLS, Realtime, Storage)
                                                              ▲
Gérant / admin ──► Netlify: apps/web (Next.js) ──────────────┘
                   /app (dashboard resto)  /admin (plateforme)
```

## Prérequis

- Projet Supabase `vaowvldazfcmietacctz` (déjà créé).
- Un compte Whapi avec au moins un canal (token par resto).
- Comptes Railway et Netlify liés au dépôt GitHub.
- Une clé de chiffrement des tokens : `openssl rand -hex 32` → **la même valeur** doit être configurée sur Railway ET Netlify (variable `TOKEN_ENCRYPTION_KEY`).

## Variables d'environnement

| Variable | Railway (bot) | Netlify (web) | Source |
|---|:---:|:---:|---|
| `SUPABASE_URL` | ✅ | — | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Supabase → API (secret ; jamais côté client) |
| `NEXT_PUBLIC_SUPABASE_URL` | — | ✅ | = SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | ✅ | Supabase → API (clé anon publique) |
| `TOKEN_ENCRYPTION_KEY` | ✅ | ✅ | `openssl rand -hex 32` (identique des deux côtés) |
| `PUBLIC_WEBHOOK_BASE_URL` | ✅ | ✅ | Domaine public Railway du bot (ex. `https://goutatou-bot.up.railway.app`) |
| `PORT` | ✅ (8080) | — | Railway injecte souvent son propre `PORT` ; le service lit `process.env.PORT` |

## 1. Migrations Supabase (prod) — [credentials]

Appliquer les 4 migrations dans l'ordre sur le projet `vaowvldazfcmietacctz` (via `supabase db push` avec le projet lié, ou le MCP Supabase `apply_migration` une fois le connecteur autorisé) :

1. `20260707000001_core_schema.sql`
2. `20260707000002_rls.sql`
3. `20260707000003_create_order_fn.sql`
4. `20260707000004_storage.sql`

> Note : la prod n'ayant jamais reçu ces migrations, `0004` s'applique directement avec les policies Storage scopées par tenant (pas de policy `menu_photos_write` permissive résiduelle). Pour un environnement qui aurait déjà appliqué une version antérieure de `0004`, ajouter une migration `drop policy if exists menu_photos_write on storage.objects;`.

Vérifier ensuite : les 13 tables existent, RLS activée, puis lancer `get_advisors` (security) et corriger tout avis bloquant.

## 2. Service bot sur Railway — [FAIT]

Déployé le 2026-07-07.

- **Projet** : `goutatou` (`5c5dce1a-1534-45ab-958d-099fb48a721d`), workspace `francksowax's Projects`.
- **Service** : `whatsapp-bot`, build via `RAILWAY_DOCKERFILE_PATH=services/whatsapp/Dockerfile`.
- **URL publique** : `https://whatsapp-bot-production-3585.up.railway.app` (port cible 8080). C'est la valeur de `PUBLIC_WEBHOOK_BASE_URL` à reporter sur Netlify.
- **Variables posées** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `PORT=8080`, `RAILWAY_DOCKERFILE_PATH`.
- **Vérifié** : `GET /health` → `{"ok":true}` ; logs `écoute sur :8080` + `notifier realtime: SUBSCRIBED`.

Notes de build (leçons de la mise en prod) :
- **Node 22 requis** : `@supabase/supabase-js` a besoin d'un WebSocket natif (Realtime) → image `node:22-slim`.
- Les paquets du monorepo sont consommés en **TS source** (pas de dist) ; le service tourne via **tsx** (`CMD ["pnpm", "--filter", "@goutatou/service-whatsapp", "exec", "tsx", "src/index.ts"]`).

Redéploiement : `railway up --detach --service whatsapp-bot` depuis la racine du repo (ou push GitHub si la source GitHub est connectée ultérieurement).

## 3. Dashboard + admin sur Netlify — [credentials]

1. Nouveau site Netlify lié au dépôt GitHub. La config est dans [`netlify.toml`](../netlify.toml) (build `pnpm --filter @goutatou/web build`, plugin `@netlify/plugin-nextjs`).
2. Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (identique à Railway), `PUBLIC_WEBHOOK_BASE_URL`.
3. Vérifier : `/login` accessible ; `/app/commandes` redirige vers `/login` si non connecté.

## 4. Créer le premier admin plateforme — [credentials]

1. Créer un utilisateur via Supabase Auth (Studio ou API).
2. L'insérer dans `platform_admins` :
   ```sql
   insert into platform_admins (user_id) values ('<uuid-du-compte-admin>');
   ```
3. Se connecter sur `/login` puis accéder à `/admin`.

## 5. Onboarder un restaurant

Depuis `/admin` (connecté en tant que platform_admin) :

1. Créer le canal Whapi côté Whapi.Cloud, récupérer son **token**.
2. Formulaire « Nouveau restaurant » : nom, slug, email + mot de passe du gérant, token Whapi. → crée le tenant, le compte gérant (rôle owner), l'abonnement (starter) et le canal chiffré.
3. Cliquer « Configurer le webhook » : appelle `checkHealth` puis pointe le webhook Whapi vers `https://<railway>/hook/<channelUuid>`.
   - Équivalent MCP Whapi : `updateChannelSettings` avec `{ webhooks: [{ mode: 'body', events: [{ type: 'messages', method: 'post' }], url: 'https://<railway>/hook/<channelUuid>' }] }`.
4. Le gérant se connecte sur `/login` → il ne voit que `/app/commandes` et `/app/menu` de SON resto.
5. Seed initial : créer les catégories/plats dans `/app/menu` et les créneaux drive (`drive_slots`) en base.

## 6. Smoke test end-to-end

Depuis un vrai WhatsApp, sur le numéro du canal :

1. Envoyer `menu` → recevoir la carte numérotée.
2. Commander (`1`), `valider`, choisir `Drive`, un créneau, `1` pour confirmer → recevoir le n° de commande.
3. Vérifier la commande dans le kanban `/app/commandes` (colonne « Reçues »).
4. Avancer le statut (→ En préparation → Prête) → recevoir chaque notification sur WhatsApp.

Le cycle complet doit passer sans intervention manuelle en base.

## Landing pages cinématiques (phase 2)

Chaque restaurant publié a une LP publique, générée depuis un template unique paramétré en base (`restaurants.lp_config`).

- **URL canonique** : `https://goutatou.netlify.app/r/<slug>` (toujours accessible). Une LP ne s'affiche que si elle est **publiée** (`published` coché dans l'éditeur) ; sinon 404.
- **Configuration** : `/admin/lp/<restaurantId>` (bouton « Configurer la LP » sur chaque fiche resto) — thème (4 couleurs + police), hero (titre/sous-titre + upload média image ou vidéo → bucket `lp-media`), section « à propos », infos pratiques (adresse, horaires, itinéraire), plats vedettes (jusqu'à 4), numéro WhatsApp, et le toggle de publication. Les changements se reflètent sur la LP après revalidation (immédiate sur l'action, ou dans les 120 s en ISR).
- **Commande web** : la LP a un panier (persisté localStorage) → tunnel `/r/<slug>/commander` → crée la commande dans le **même kanban** `/app/commandes` que le bot (source `web`), avec confirmation WhatsApp best-effort. Paiement à la remise.
- **Domaine wildcard (optionnel)** : pour servir `chez-mama.goutatou.com` → `/r/chez-mama`, acheter le domaine, le rattacher à Netlify (DNS + domain alias `*.goutatou.com`), poser la variable `NEXT_PUBLIC_ROOT_DOMAIN=goutatou.com` et **redéployer**. Sans cette variable, seul le chemin `/r/<slug>` est utilisé (comportement par défaut sur netlify.app).
- **Migration** : le bucket `lp-media` (migration `20260707000007_lp_media.sql`) est appliqué en prod, policies scopées par tenant (comme `menu-photos`), sans listing public.

## Campagnes WhatsApp (phase 4A, premium)

Broadcast rate-limité aux clients opt-in d'un restaurant, réservé au plan **premium**.

- **Gating** : la section `/app/campagnes` et les actions de création/envoi ne sont accessibles qu'aux restos `subscriptions.plan = 'premium'`. Passer un resto en premium se fait en base : `update subscriptions set plan = 'premium' where restaurant_id = '<id>';`.
- **Worker d'envoi** : hébergé dans le service bot Railway (`services/whatsapp`). Il poll les campagnes `scheduled` échues → `sending`, snapshot l'audience une seule fois au lancement (clients `opted_out = false` à cet instant, figée ensuite), et envoie via Whapi avec un **délai + jitter entre chaque message** (anti-ban WhatsApp) et un **cap journalier par resto**. Variables (défauts entre parenthèses) : `CAMPAIGN_POLL_MS` (15000), `CAMPAIGN_SEND_DELAY_MIN_MS` (4000), `CAMPAIGN_SEND_DELAY_MAX_MS` (8000), `CAMPAIGN_DAILY_CAP` (500), `CAMPAIGN_BATCH_SIZE` (50). Log de démarrage : `[campaign-worker] démarré`.
- **Invariant single-instance** : le service `whatsapp-bot` DOIT tourner en une seule instance (replicas = 1). Le worker n'a pas de claim atomique par destinataire (pas de `SELECT ... FOR UPDATE SKIP LOCKED` ni équivalent) ; un scaling horizontal ferait envoyer chaque message en double par plusieurs instances concurrentes.
- **Opt-out** : un client qui envoie **STOP** / *désabonner* passe `opted_out = true` (géré par le bot) et est exclu de toutes les campagnes.
- **Migrations** : `20260709000008_campaigns.sql` (tables + RLS + realtime + bucket `campaign-media`) et `20260709000009_campaign_counters.sql` (RPC `bump_campaign_counter` service_role-only), appliquées en prod.
- **UI** : `/app/campagnes` (liste temps réel), `/nouvelle` (composer : message + média + envoyer/programmer), `/[id]` (progression live + annulation).

## Fidélité — roue de la fortune (phase 3A, palier Pro)

Après N commandes récupérées, le client reçoit un lien de roue WhatsApp ; le tirage pondéré et le décrément de stock sont atomiques côté serveur.

- **Gating** : `/app/fidelite` et les actions sont réservées aux restos `subscriptions.plan in ('pro','premium')` ET `status='active'`. Passer un resto en pro : `update subscriptions set plan='pro' where restaurant_id='<id>';`.
- **Configuration** (`/app/fidelite`) : lots (libellé, poids de tirage, stock — `-1` = illimité), activation de la roue + N commandes déclencheur, et validation des codes gagnés au comptoir.
- **Déclencheur** : le notifier Railway envoie le lien de roue quand une commande passe `recuperee` et que le client atteint un multiple de N (avec au moins un lot en stock). Lien signé HMAC (`WHEEL_JWT_SECRET`), usage unique, TTL 72h.
- **Tirage** : fonction SQL `spin_wheel` (`service_role`-only) — tirage pondéré poids × stock, décrément atomique (garde NOT FOUND anti-survente), verrou advisory sur le `jti` (anti double-spin concurrent), code unique 6 caractères.
- **Variables** : `WHEEL_JWT_SECRET` (`openssl rand -hex 32`) — **la MÊME valeur sur Railway ET Netlify** (le bot signe, le web vérifie) ; `WHEEL_BASE_URL=https://goutatou.netlify.app` (Railway). Sans elles, le bot ne démarre pas (`required()`).
- **Migrations** : `20260709000010_loyalty.sql` (prizes, wheel_spins, colonnes roue, RLS) et `20260709000011_spin_wheel_fn.sql` (fonction atomique) — appliquées en prod.
- **Écritures `restaurants`** : la table `restaurants` n'a pas de policy RLS UPDATE pour les membres ; `updateWheelSettings` passe par le client admin (service-role) après la garde Pro + résolution serveur du resto.

## Dépannage

- **Canal `error` dans `/admin`** : token Whapi invalide/expiré → recréer le canal, mettre à jour le token.
- **Webhook non reçu** (`last_webhook_at` vide) : vérifier que l'URL configurée chez Whapi correspond bien à `https://<railway>/hook/<channelUuid>` (UUID = `whapi_channels.id`, pas le `channel_id` Whapi).
- **Photos menu non visibles** : bucket `menu-photos` en lecture publique ; vérifier les policies Storage (`menu_photos_read`).
- **Build Netlify échoue** : vérifier `NODE_VERSION=20` et que les 4 paquets du monorepo se résolvent (les composants client importent depuis `@goutatou/db/types`).
