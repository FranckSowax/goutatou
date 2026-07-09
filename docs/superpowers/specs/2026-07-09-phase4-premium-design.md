# Goutatou Phase 4 (Premium) — Spec de conception

Date : 2026-07-09 · Statut : validé en brainstorming.

## Objectif

Tier premium de Goutatou : **campagnes WhatsApp broadcast** (4A) et **module pubs Meta agent-assisté** (4B). Réservé aux restaurants dont `subscriptions.plan = 'premium'`.

## Décisions actées (brainstorming)

| Décision | Choix |
|---|---|
| Architecture pubs Meta | **Outil d'ops agent-assisté** : la plateforme prépare briefs/audiences/copies et suit les métriques ; les campagnes sont lancées par l'équipe Goutatou via le MCP Meta Ads. Pas d'OAuth par resto, pas de revue d'app Meta. |
| Audience campagnes WhatsApp | **Tous les clients opt-in** du resto (`opted_out = false`), rate-limité. Segmentation = plus tard. |
| Ordre de construction | **4A (WhatsApp) d'abord**, puis 4B (Meta). |

## Décomposition — deux sous-projets, deux plans

- **4A — Campagnes WhatsApp broadcast** : plan + implémentation en premier.
- **4B — Module pubs Meta** : plan séparé après 4A (dépend de la disponibilité du MCP Meta Ads).

---

## 4A — Campagnes WhatsApp broadcast

### Modèle de données (Postgres/Supabase)

Les tables étaient prévues au design de phase 1, jamais construites :

- `campaigns` : `id`, `restaurant_id`, `name`, `body text`, `media_url text?`, `status` (`draft` | `scheduled` | `sending` | `sent` | `canceled`), `scheduled_at timestamptz?`, `total_recipients int`, `sent_count int`, `failed_count int`, `created_by uuid`, `created_at`, `started_at?`, `finished_at?`.
- `campaign_recipients` : `id`, `campaign_id`, `restaurant_id` (pour RLS), `customer_id`, `status` (`pending` | `sent` | `failed`), `error text?`, `sent_at?`. Unicité `(campaign_id, customer_id)`.

RLS : mêmes politiques tenant que les autres tables (`is_member(restaurant_id)`), + gating premium vérifié applicativement.

### Où tourne l'envoi

Le **service bot Railway** héberge le worker d'envoi : il a déjà le client Whapi, l'accès DB service-role, la résolution des canaux, et tourne en continu. Ajout dans `services/whatsapp` d'un **campaign worker** :

1. Poll périodique (intervalle configurable, ex. 15 s) des campagnes `status = 'scheduled'` dont `scheduled_at <= now()` → passage en `sending`, snapshot des destinataires (clients `opted_out = false` du resto) dans `campaign_recipients` (idempotent), `total_recipients` renseigné.
2. Pour chaque campagne `sending`, dépile les `campaign_recipients` `pending` par petits lots, envoie via Whapi (texte ou média), marque `sent`/`failed` + `sent_at`/`error`, incrémente les compteurs. **Rate-limit anti-ban** : délai configurable + jitter entre chaque envoi (défaut 4-8 s), cap journalier par canal. Une seule campagne `sending` par resto à la fois.
3. Quand tous les destinataires sont traités → `status = 'sent'`, `finished_at`.
4. Reprise : le worker est idempotent (les `sent` ne sont jamais renvoyés), survit à un redéploiement.

### Opt-out

Ajout au processor du bot (phase 1) : détection des mots-clés **STOP** / **DÉSABONNER** / **STOPPER** en entrée → `customers.opted_out = true` + réponse de confirmation FR. Les snapshots de campagne excluent toujours `opted_out = true`. Conformité + protection anti-ban.

### Gating premium

La section campagnes n'apparaît (UI) et n'accepte les créations (server action) que si `subscriptions.plan = 'premium'` pour le resto. Un helper `assertPremium(restaurantId)` partagé.

### UI — `/app/campagnes`

- Liste des campagnes avec statut + compteurs (temps réel via Realtime sur `campaigns`).
- Composer : nom, corps du message (avec aperçu), média optionnel (upload → bucket `campaign-media` tenant-scopé, mêmes policies durcies que `menu-photos`/`lp-media`), nombre de destinataires estimé (clients opt-in), bouton « Programmer » (date/heure) ou « Envoyer maintenant ».
- Détail campagne : progression (envoyés/échecs/en attente), possibilité d'annuler une campagne `scheduled` ou `sending` (le worker s'arrête proprement au prochain lot).

### Rate-limiting mutualisé

La logique de throttle du worker (délai + jitter + cap) est extraite dans un module testable ; elle sert aussi de référence pour le rate-limiting de l'API de commande web (suivi ouvert en phase 2).

### Tests

- Unitaires : sélection d'audience (exclusion opt-out), calcul du prochain délai (jitter borné), machine de statut de campagne (draft→scheduled→sending→sent, annulation), détection du mot-clé opt-out dans le processor.
- Intégration : worker mocké DB+Whapi → un lot de destinataires passe `pending`→`sent`, un échec Whapi → `failed` + error, idempotence (relance ne renvoie pas les `sent`).

---

## 4B — Module pubs Meta (agent-assisté) — design haut niveau

La plateforme ne parle **pas** directement à l'API Meta. Elle prépare et suit ; l'équipe Goutatou exécute via le MCP Meta Ads.

- **Table `ad_briefs`** : `restaurant_id`, objectif, budget, audience cible (texte libre + géo Gabon), offre, statut (`draft`/`prepared`/`launched`/`archived`), `meta_campaign_id text?`, `meta_ad_account_id text?`, métriques jsonb (dépense, CTR, conversations WhatsApp), `synced_at?`.
- **UI** (`/app/pubs`, gating premium) : le resto/Goutatou saisit un brief ; la plateforme génère une **audience Click-to-WhatsApp** (numéro du canal Whapi + copies FR + assets suggérés depuis le menu/LP) et l'affiche pour exécution manuelle via le MCP.
- **Exécution** : l'équipe Goutatou lance la campagne via le **MCP Meta Ads**, renseigne `meta_campaign_id`/`meta_ad_account_id` ; un sync (à la demande ou périodique) récupère les métriques et les affiche.
- Pas d'OAuth par resto, pas de revue d'app Meta.

⚠️ Dépendance : le MCP Meta Ads (`mcp.facebook.com/ads`) doit être connecté au moment de l'implémentation de 4B (il s'est déconnecté en cours de session précédente).

---

## Hors périmètre (YAGNI)

- Segmentation d'audience avancée (par récence/tags) — plus tard.
- Intégration Meta programmatique par resto (OAuth + API Marketing + revue d'app) — écartée au profit de l'agent-assisté.
- Templates de messages WhatsApp officiels (WABA) — Whapi utilise un canal non-officiel ; les campagnes broadcast restent soumises au risque de ban, d'où le rate-limit strict.
- A/B testing des campagnes.

## Phasage

1. **4A — Campagnes WhatsApp** : schéma + worker Railway + opt-out + gating + UI. → premier livrable premium.
2. **4B — Module pubs Meta** : `ad_briefs` + génération de brief/audience + sync métriques via MCP.
