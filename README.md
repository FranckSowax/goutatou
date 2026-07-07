# Goutatou

Plateforme SaaS multi-restaurants : prise de commande WhatsApp (bot Whapi), dashboard de gestion temps réel, drive, et onboarding multi-tenant. Landing pages cinématiques, fidélisation et automatisation réseaux/pubs arrivent en phases ultérieures.

## Stack

- **Supabase** — Postgres (schéma multi-tenant + RLS), Auth, Realtime, Storage.
- **Railway** — service bot WhatsApp (`services/whatsapp`, Express + Whapi).
- **Netlify** — dashboard & admin (`apps/web`, Next.js 15).

## Monorepo (pnpm)

```
packages/db          Types partagés, crypto AES-256-GCM, client Supabase (exports /types /crypto /client)
packages/whapi       Client REST Whapi (retry/backoff)
services/whatsapp    Bot : webhook, machine à états, repo Supabase, notifier Realtime
apps/web             Next.js : /app (kanban commandes + menu), /admin (onboarding)
supabase/            Migrations (schéma, RLS, create_order, storage, durcissement) + tests pgTAP
```

## Développement

```bash
pnpm install
supabase start          # stack locale (Docker)
supabase db reset       # applique les migrations
supabase test db        # tests pgTAP
pnpm -r test            # tests unitaires (db, whapi, bot, web)
```

## Déploiement

Voir [docs/deploiement.md](docs/deploiement.md) : migrations Supabase, service Railway, site Netlify, variables d'environnement et onboarding d'un restaurant.

## Documentation

- Spec de conception : [docs/superpowers/specs/2026-07-07-goutatou-platform-design.md](docs/superpowers/specs/2026-07-07-goutatou-platform-design.md)
- Plan phase 1 : [docs/superpowers/plans/2026-07-07-phase1-socle.md](docs/superpowers/plans/2026-07-07-phase1-socle.md)
