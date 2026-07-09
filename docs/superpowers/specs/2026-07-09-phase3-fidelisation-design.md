# Goutatou Phase 3 (Fidélisation) — Spec de conception

Date : 2026-07-09 · Statut : validé en brainstorming.

## Objectif

Fidélisation client : **roue de la fortune + lots** (3A) et **statuts WhatsApp programmés** (3B). Features du palier **Pro** (plan `pro` OU `premium`). Le **Mobile Money** est reporté (dépendance externe : compte marchand / agrégateur + credentials).

## Décisions actées (brainstorming)

| Décision | Choix |
|---|---|
| Mobile Money | **Reporté** jusqu'aux credentials (compte marchand Airtel/Moov ou agrégateur). Non construit. Chip de suivi. |
| Déclencheur de la roue | **Après N commandes récupérées** (N configurable par resto). |
| Statuts WhatsApp programmés | **Inclus** en phase 3, après la roue. |
| Gating | Roue + statuts = palier **Pro** (`plan in ('pro','premium')`), distinct des campagnes (premium-only). |

## Décomposition — deux sous-projets, deux plans

- **3A — Roue de fidélité + lots** : plan + implémentation en premier.
- **3B — Statuts WhatsApp programmés** : plan séparé après 3A.

---

## 3A — Roue de fidélité + lots

### Modèle de données

- `prizes` : `id`, `restaurant_id`, `label`, `weight int` (poids de tirage), `stock int` (restant ; `-1` = illimité), `active boolean`, `position int`, `created_at`.
- `wheel_spins` : `id`, `restaurant_id`, `customer_id`, `prize_id`, `code text` (6 caractères, unique par resto), `jti text unique` (usage unique du token), `created_at`, `redeemed_at timestamptz?`, `redeemed_by uuid?`.
- `restaurants` : colonnes `wheel_enabled boolean default false`, `wheel_trigger_orders int default 5` (N commandes récupérées avant d'offrir un tour).

RLS tenant (`is_member(restaurant_id)`) sur `prizes` et `wheel_spins`. Le tirage passe par une fonction SQL `service_role`-only.

### Déclencheur (notifier Railway)

Le notifier (`services/whatsapp/src/notifier.ts`) traite déjà les changements de statut de commande via Realtime. Extension : quand une commande passe à `recuperee`, compter les commandes `recuperee` du client pour ce resto ; si `wheel_enabled`, `count % wheel_trigger_orders == 0`, et au moins un `prizes` actif avec stock (`stock != 0`), envoyer au client un message WhatsApp avec le lien `${WHEEL_BASE_URL}/roue?t=<JWT>`.

Le JWT (secret `WHEEL_JWT_SECRET`) porte `{ restaurantId, customerId, jti, exp }`, TTL 72h, **usage unique** (le `jti` est vérifié/consommé au spin).

### Page roue `/roue` (web, publique via token)

- `apps/web/src/app/roue/page.tsx` : lit `?t=<jwt>`, valide le token côté serveur (signature + exp), charge les lots actifs du resto pour dessiner la roue, rend le composant client d'animation.
- Composant client : roue (canvas ou CSS/SVG), bouton « Tourner ». Au clic → `POST /api/roue/spin` avec le token.
- `apps/web/src/app/api/roue/spin/route.ts` (runtime nodejs, service-role) : valide le token, appelle la fonction SQL `spin_wheel(restaurant_id, customer_id, jti)` qui, **en transaction atomique** : vérifie que le `jti` n'a pas déjà été consommé (sinon erreur `already_spun`), fait le **tirage pondéré** parmi les lots actifs à stock disponible (poids × disponibilité), décrémente le stock du lot gagné (si non illimité), génère un `code` unique, insère le `wheel_spins`, et retourne `{ prize_id, label, code }`. Le front anime la roue jusqu'au lot gagné, puis affiche le code. Le client reçoit aussi le code par WhatsApp (best-effort depuis la route).

### Redemption + config `/app/fidelite` (dashboard, gating Pro)

- CRUD des lots (`prizes` : label, poids, stock, actif).
- Réglages de la roue (`wheel_enabled`, `wheel_trigger_orders`).
- Validation d'un code gagné au comptoir : saisie du code → marque `redeemed_at`/`redeemed_by` (rejette si déjà utilisé ou inconnu).

### Sécurité

- Tirage **exclusivement côté serveur** (fonction SQL `service_role`-only) — le client n'influence jamais le résultat.
- Token JWT signé, usage unique vérifié en transaction (pas de double tour), stock décrémenté atomiquement (pas de survente).
- Route de spin rate-limitée légèrement (le token usage-unique borne déjà l'abus).

### Tests

- Unitaires : tirage pondéré (distribution respecte les poids ; exclut stock 0), génération/format du code, validation du token (signature, exp, jti), machine de redemption (valide/déjà utilisé/inconnu), calcul du déclencheur (count % N).
- Intégration : `spin_wheel` en pgTAP (atomicité : deux appels même jti → un seul spin ; stock décrémenté ; pas de tirage si tous stocks à 0).

---

## 3B — Statuts WhatsApp programmés (design haut niveau)

- Whapi supporte la publication de **statuts/stories** sur le canal (endpoints stories : texte / média).
- **Table `statuses`** : `restaurant_id`, `kind` (`text`|`image`), `content text`, `media_url text?`, `scheduled_at`, `status` (`draft`|`scheduled`|`posted`|`failed`|`canceled`), `posted_at?`, `error?`.
- **Status worker** sur Railway (même patron que le campaign worker) : poll les `scheduled` échus → publie via l'API Whapi (endpoint stories) → marque `posted`/`failed`. Volume faible, throttle léger.
- **UI `/app/statuts`** (gating Pro) : composer (texte ou image), programmer, liste avec statut.
- Réutilise : bucket tenant-scopé pour les médias, worker/poll pattern, gating `assertPlan(['pro','premium'])`.

---

## Hors périmètre (YAGNI)

- Mobile Money (reporté — chip de suivi).
- Points de fidélité cumulables / cartes de fidélité à points (la roue est le mécanisme retenu).
- Roue multi-lots par tour, jackpots progressifs.
- Statuts avec ciblage d'audience (un statut est public sur le canal).

## Phasage

1. **3A — Roue de fidélité** : schéma + fonction `spin_wheel` atomique + déclencheur notifier + page roue + API spin + `/app/fidelite` (config + redemption) + gating Pro. → premier livrable.
2. **3B — Statuts WhatsApp** : table `statuses` + status worker Railway + UI `/app/statuts`.
