# Spec — Page Clients (CRM)

Date : 2026-07-18. Migration `20260718000035`. Web uniquement. Gating **Pro**.

## Intention

Un répertoire clients qui débloque le marketing : voir chaque client, son historique, sa valeur (LTV),
le segmenter (fidèles / inactifs / nouveaux), le contacter (Appeler / WhatsApp) et lui attacher une note.

## Décisions (validées)

- Gating **Pro** (`isPro`), comme Fidélité/Statuts.
- **Note libre par client** → migration : `customers.notes text`.

## Données

- `customers` : `id, name, phone, chat_id, marketing_opt_in, opted_out, created_at` (+ `notes` migration 0035).
- Agrégats dérivés des `orders` (par `customer_id`, hors annulées) : nb commandes, **LTV** (Σ total),
  dernière commande, panier moyen, plat préféré (via `order_items`).

```sql
-- migration 0035
alter table public.customers add column if not exists notes text;
notify pgrst, 'reload schema';
```
`customers` a déjà la RLS tenant (0002). L'écriture de note passe par le client authentifié si une policy
UPDATE tenant existe, sinon client admin après gate membre (vérifier — pattern `reglages`).

## Part A — Helpers purs (testés) `lib/clients.ts`

- `type ClientRow = { id, name, phone, ordersCount, ltv, lastOrderAt, avgBasket, favoriteItem, marketingOptIn, optedOut, createdAt, notes }`.
- `buildClients(customers, orders, orderItems, now)` → `ClientRow[]` : agrège les commandes par client
  (count, LTV, last, avg, plat préféré), trie par LTV desc.
- `segmentOf(client, now)` → `'fidele' | 'inactif' | 'nouveau' | 'desabonne' | 'actif'` :
  fidèle = `ordersCount >= 3` ; inactif = `lastOrderAt` > 30 j (ou jamais commandé mais ancien) ;
  nouveau = `createdAt` < 30 j ; désabonné = `optedOut`. Seuils constants documentés.
- `filterBySegment(clients, segment, now)` + `searchClients(clients, query)` (nom/tél).
- Tests : agrégation, segments (seuils limites), recherche.

## Part B — Page `/app/clients`

**Files :** `apps/web/src/app/app/clients/{page.tsx, clients-view.tsx, clients-data.ts, actions.ts}` ;
Modify `layout.tsx` (nav), `nav-links.tsx` (icône `Users`).

- **`clients-data.ts`** : `getClients(supabase, restaurantId)` → charge `customers` + `orders(customer_id,
  total, status, created_at, order_items(name, qty))` du resto, appelle `buildClients`. (Cap raisonnable /
  pagination si gros volume — v1 : tous, ordonnés par LTV ; ajouter `.limit` si nécessaire.)
- **`page.tsx`** (Server) : garde membre + **`isPro`** (sinon carte d'upsell homogène). `getClients` →
  `<ClientsView>`.
- **`clients-view.tsx`** (client, pour recherche/segments/modal) :
  - Bandeau KPIs : total · actifs 30 j · opt-ins · nouveaux ce mois.
  - Pills de segment (Tous/Fidèles/Inactifs/Nouveaux/Désabonnés) + champ recherche.
  - Liste : lignes/cartes (nom, tél, nb commandes, **LTV** `formatFcfa`, dernière commande, badge opt-in).
  - **Fiche client** (Dialog) : historique commandes, LTV, panier moyen, plat préféré, « client depuis »,
    **note éditable** (textarea + Enregistrer → `updateCustomerNote`), boutons **📞 Appeler** (`tel:`) /
    **💬 WhatsApp** (`wa.me`).
  - Pleine largeur, responsive, cibles ≥44px, tokens du thème.
- **`actions.ts`** : `updateCustomerNote(customerId, notes)` — garde membre + resto, écrit `customers.notes`
  (client admin si pas de policy UPDATE tenant), `revalidatePath('/app/clients')`.

## Part C — Navigation

- `layout.tsx` : `{ href: '/app/clients', label: 'Clients', icon: 'Users', match: '/app/clients' }` après
  Conversations (groupe relation client). Le séparateur reste sous Conversations (le placer après Clients si
  plus logique — au choix, cohérent avec le regroupement).
- `nav-links.tsx` : importer `Users` (lucide) + l'ajouter à `ICONS`.

## Sécurité / contraintes

- Gating Pro avant tout chargement. RLS tenant sur `customers`/`orders`. FR, tokens du thème, ≥44px.
- Pas de données perso hors du resto (scoping `restaurant_id`). Contact = actions user explicites (`tel:`/`wa.me`).
- `@goutatou/db/types` côté client ; imports relatifs en test ; `next build` avant deploy.

## Tests

- Purs : `buildClients` (agrégation, plat préféré, tri LTV), `segmentOf` (seuils), `searchClients`.
- Page/actions : build + typecheck verts ; smoke.

## Hors périmètre v1

- Tags multiples / segments configurables (seuils fixes v1). Export CSV. Fusion de doublons.
- Ajout direct à une campagne depuis la fiche (lien vers Marketing suffit v1).

## Déploiement

Migration 0035 via MCP + `notify pgrst`. Web (Netlify). Smoke : /app/clients (Pro) → liste + segments +
recherche + fiche (historique, note, contact) ; non-Pro → upsell.
