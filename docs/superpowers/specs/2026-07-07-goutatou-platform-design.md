# Goutatou — Plateforme SaaS multi-restaurants (spec de conception)

Date : 2026-07-07 · Statut : validé en brainstorming (options recommandées retenues)

## 1. Objectif

Plateforme SaaS qui permet à Goutatou d'onboarder des restaurants et de leur fournir :

1. Une landing page cinématique scroll-motion (sous-domaine dédié).
2. Un chatbot WhatsApp de prise de commande et de gestion clients (via API Whapi).
3. Un mode **Drive** (retrait sur créneau) dans le flow de commande.
4. Un programme de fidélisation par jeu : roue à tourner + lots.
5. La gestion de la chaîne de commande (kanban temps réel) et des statuts WhatsApp.
6. **Premium** : automatisation des réseaux sociaux et publicités via MCP Meta, campagnes WhatsApp broadcast.

Chaque restaurant a sa propre interface de gestion ; les clients commandent via WhatsApp ou via le site. Goutatou (admin plateforme) crée la LP et configure le canal Whapi de chaque resto.

Inspirations : `Whapi-Cloud/nodejs-whatsapp-chatbot` (patterns d'envoi/réception Whapi) ; le template scroll-motion s'appuie sur le pipeline motion-website-sowax (GSAP ScrollTrigger + Lenis). Le repo `mllebobun` (privé, inaccessible) est explicitement ignoré.

## 2. Décisions actées

| Décision | Choix |
|---|---|
| Hébergement | Supabase (DB/Auth/Realtime/Storage) + Netlify (front Next.js, wildcard sous-domaines) + Railway (service bot Node.js) |
| Paiement | Phase 1 : paiement à la remise (cash / Mobile Money au comptoir). Intégration Mobile Money en phase 3. |
| Repo mllebobun | Ignoré (privé). Template LP construit from scratch sur GSAP/Lenis. |
| LP par resto | Template unique paramétrable (config en base), PAS un site codé par resto. |

## 3. Architecture

Monorepo, deux unités déployables :

```
goutatou/
├── apps/web/                 # Next.js 15 App Router — Netlify
│   ├── app/(lp)/[resto]/     # LP cinématique multi-tenant (résolution par sous-domaine)
│   ├── app/(lp)/[resto]/commander/   # commande web (même pipeline orders)
│   ├── app/(lp)/[resto]/roue/        # mini-app roue de la fortune (token signé)
│   ├── app/app/              # dashboard restaurant (auth Supabase, rôle resto)
│   └── app/admin/            # back-office plateforme (rôle platform_admin)
├── services/whatsapp/        # Node.js/Express — Railway
│   ├── src/webhook.ts        # POST /hook — routage par channel_id → restaurant
│   ├── src/bot/machine.ts    # machine à états conversationnelle
│   ├── src/whapi.ts          # client Whapi (texte, média, produit, groupe, statut)
│   └── src/notify.ts         # notifications statut commande, campagnes, rate-limit
├── packages/db/              # types + client Supabase partagés, migrations SQL
└── docs/
```

### 3.1 Multi-tenancy

- Tenant racine = `restaurants`. Toutes les tables métier portent `restaurant_id`.
- RLS Supabase : un utilisateur resto (membre de `restaurant_members`) ne voit que son tenant ; le rôle `platform_admin` voit tout.
- Le service WhatsApp utilise la clé `service_role` (il est le seul backend de confiance) ; il résout le tenant via `whapi_channels.channel_id` reçu dans chaque webhook.
- LP : middleware Next.js lit le sous-domaine `{slug}.goutatou.com` → charge la config LP du resto. Domaine custom possible plus tard (mapping en base).

### 3.2 Service WhatsApp (généralisation du repo Whapi)

Différences clés avec le repo d'exemple :

- **Multi-canal** : un token Whapi par resto, stocké chiffré dans `whapi_channels`. Un seul service, webhooks routés par canal.
- **État persistant** : la conversation (état + panier en cours) vit dans `conversations` (Postgres), pas en mémoire — survit aux redéploiements.
- **Flow** : `ACCUEIL → MENU (messages produits/images) → PANIER → MODE (Drive / Livraison / Sur place) → [Drive : choix créneau] → RÉCAP + CONFIRMATION → SUIVI`.
- Toute commande confirmée crée `orders` + `order_items` ; le client reçoit une notification à chaque changement de statut (Reçue → En préparation → Prête → Récupérée/Livrée).
- Commandes hors-flow : "menu", "commande" (statut en cours), "humain" (handoff : le bot se tait, le resto répond depuis WhatsApp Business ou le dashboard).
- **Statuts WhatsApp** : publication programmée (table `statuses`, cron dans le service).
- **Campagnes broadcast (premium)** : file d'envoi avec rate-limit configurable (protection anti-ban), opt-out respecté (`customers.opted_out`).

### 3.3 Dashboard restaurant (`/app`)

- Kanban commandes temps réel (Supabase Realtime).
- CRUD menu (catégories, plats, photos → Storage, disponibilité).
- Clients : historique, points fidélité, tags.
- Fidélisation : configuration des lots de la roue, validation des codes gagnés au comptoir.
- Drive : définition des créneaux et capacité par créneau.
- Statuts WhatsApp : composer + programmer.
- Premium : campagnes WhatsApp ; module pubs Meta (audit/lancement de campagnes via le MCP Meta Ads côté plateforme).

### 3.4 Admin plateforme (`/admin`)

- Onboarding resto : formulaire (identité, branding, menu initial, médias hero) → crée le tenant, génère la LP, enregistre le canal Whapi (token saisi après création du canal chez Whapi).
- Gestion des plans/abonnements (`subscriptions` : starter / pro / premium — le gating des features lit ce plan).
- Santé des canaux : dernier webhook reçu, erreurs d'envoi.

### 3.5 Landing page cinématique

- Template unique paramétrable : palette, typographie, textes, plats vedettes, médias hero (vidéo Seedance/Higgsfield ou photos), sections activables.
- Scroll-motion : GSAP ScrollTrigger + Lenis, effets du pipeline motion-website-sowax (grain, vignette, glass cards, pacing).
- CTA « Commander » → deep link `wa.me/{numéro}?text=...` (pré-remplit le bot) **ou** tunnel de commande web qui écrit dans le même pipeline `orders`.
- Rendu SSR/ISR pour la perf mobile (cible : réseaux mobiles gabonais).

## 4. Modèle de données (Postgres/Supabase)

- `restaurants` (slug, branding jsonb, lp_config jsonb, timezone, plan courant)
- `restaurant_members` (user_id, restaurant_id, role: owner|staff)
- `whapi_channels` (restaurant_id, channel_id, token chiffré, phone, status)
- `menu_categories`, `menu_items` (prix en FCFA, photo, disponible)
- `customers` (restaurant_id, phone WhatsApp, nom, opted_out, points)
- `conversations` (customer_id, state, cart jsonb, updated_at)
- `orders` (restaurant_id, customer_id, mode: drive|livraison|sur_place, créneau drive, statut, total, source: whatsapp|web)
- `order_items`
- `drive_slots` (créneaux, capacité)
- `prizes`, `wheel_spins` (token signé, résultat, redeemed_at), `loyalty_points`
- `statuses` (contenu, scheduled_at, published_at)
- `campaigns`, `campaign_recipients` (statut d'envoi par destinataire)
- `subscriptions` (plan, période, statut)

Migrations SQL versionnées dans `packages/db/migrations`, appliquées via Supabase CLI.

## 5. Fidélisation — roue de la fortune

1. Trigger : après N commandes (configurable), le bot envoie un lien `https://{slug}.goutatou.com/roue?t={JWT signé, usage unique, TTL 72h}`.
2. Mini-page mobile : animation de roue (canvas/CSS), tirage **côté serveur** (route handler Next.js, probabilités pondérées par lot et stock restant) — le front ne fait qu'animer le résultat.
3. Gain → `wheel_spins` + message WhatsApp avec code à 6 caractères.
4. Le resto valide le code dans son dashboard (marque `redeemed_at`).

## 6. Gestion des erreurs

- Webhook Whapi : réponse 200 immédiate, traitement asynchrone ; message inparsable → réponse de secours ("tapez *menu*") ; jamais de crash du flux global pour un canal en erreur.
- Envois Whapi : retry avec backoff (3 tentatives), échecs journalisés dans `message_logs`, visibles dans `/admin`.
- Token Whapi invalide/expiré → canal marqué `error`, alerte admin.
- Roue : token à usage unique vérifié en transaction (pas de double spin) ; stock de lots décrémenté atomiquement.
- Commandes web et WhatsApp convergent vers le même pipeline → pas de double logique.

## 7. Tests

- **Unitaires** (Vitest) : machine à états du bot (chaque transition), calcul panier/total, tirage pondéré de la roue, gating par plan.
- **Intégration** : webhook simulé (payloads Whapi rejoués) → assertions sur `orders`/`conversations` ; client Whapi mocké.
- **RLS** : tests SQL vérifiant l'isolation entre deux tenants.
- **E2E léger** (Playwright) : parcours commande web + kanban dashboard.

## 8. Plans commerciaux

| Feature | Starter | Pro | Premium |
|---|---|---|---|
| LP cinématique + bot commandes + dashboard | ✅ | ✅ | ✅ |
| Drive + roue/lots + statuts WhatsApp | — | ✅ | ✅ |
| Campagnes WhatsApp + pubs Meta (MCP) | — | — | ✅ |

## 9. Phasage (chaque phase = un plan d'implémentation dédié)

1. **Socle** : monorepo, schéma Supabase + RLS, service Whapi multi-tenant (flow commande complet, drive inclus dans le flow), dashboard commandes/menu temps réel, `/admin` onboarding minimal. → produit vendable au premier resto.
2. **LP cinématique** : template GSAP/Lenis paramétrable, wildcard Netlify, tunnel de commande web.
3. **Fidélisation + confort** : roue/lots, points, statuts programmés, intégration Mobile Money.
4. **Premium** : campagnes broadcast, module pubs Meta via MCP, analytics avancés.

## 10. Hors périmètre (YAGNI)

- App mobile native ; imprimantes tickets ; gestion de stock/ingrédients ; multi-langue (FR uniquement au départ) ; facturation automatisée des abonnements (manuel au début).
