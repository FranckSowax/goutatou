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

## 2. Service bot sur Railway — [credentials]

1. Créer le projet Railway `goutatou`, service `whatsapp-bot` connecté au dépôt GitHub (racine `/`, `Dockerfile` = `services/whatsapp/Dockerfile`).
2. Configurer les variables : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `PORT=8080`.
3. Générer le domaine public → le noter comme `PUBLIC_WEBHOOK_BASE_URL` (à reporter sur Railway et Netlify).
4. Vérifier : `curl https://<domaine-railway>/health` → `{"ok":true}`.

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

## Dépannage

- **Canal `error` dans `/admin`** : token Whapi invalide/expiré → recréer le canal, mettre à jour le token.
- **Webhook non reçu** (`last_webhook_at` vide) : vérifier que l'URL configurée chez Whapi correspond bien à `https://<railway>/hook/<channelUuid>` (UUID = `whapi_channels.id`, pas le `channel_id` Whapi).
- **Photos menu non visibles** : bucket `menu-photos` en lecture publique ; vérifier les policies Storage (`menu_photos_read`).
- **Build Netlify échoue** : vérifier `NODE_VERSION=20` et que les 4 paquets du monorepo se résolvent (les composants client importent depuis `@goutatou/db/types`).
