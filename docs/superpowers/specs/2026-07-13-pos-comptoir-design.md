# Spec — Caisse Sur Place (POS) + board enrichi + ticket

Date : 2026-07-13. Branche : `feature/pos-comptoir`. Migration `20260713000031`.

## Intention

Trois demandes de Franck sur la page Commandes :
1. **Colonne Détails** : voir les articles d'une commande directement dans la liste.
2. **Colonne Imprimer** : une icône par ligne → ticket de commande imprimable.
3. **Dropdown de statut** dans la colonne Action : passer à n'importe quel statut (les 5), pas seulement
   « avancer » linéairement.
4. **Bouton « Sur Place »** → une **caisse (POS)** : catégories + plats + suppléments, ajout rapide au
   panier, validation → commande créée + **ticket imprimé**. But : prendre vite les commandes au comptoir.

## Décisions produit (validées)

- **Client comptoir** : téléphone **optionnel**. Saisi → vrai client (fidélité, reçu WhatsApp, historique) ;
  vide → client générique **« Comptoir »** du resto.
- **Impression** : aperçu **format reçu (58/80 mm)** + `window.print()` — marche avec toute imprimante
  branchée (thermique via pilote OS), zéro intégration matérielle.

## Réutilisé (rien à réinventer)

- `create_order` RPC (contrat suppléments identique à la LP : `p_items = [{ menu_item_id, qty, supplement_ids? }]`)
  — cf. `apps/web/src/app/api/lp/[slug]/order/route.ts`.
- `updateOrderStatus(orderId, status)` — accepte **déjà** n'importe quel statut (`actions.ts`).
- Le **Supabase Realtime + l'overlay cuisine** (Cuisine Live) : une commande comptoir apparaît sur le
  Kanban et déclenche l'overlay **gratuitement**.
- L'éditeur de suppléments / la structure du menu (`menu_categories` → `menu_items` → `menu_supplements`).

## Données (migration 0031)

```sql
-- Source 'comptoir' pour distinguer les ventes au comptoir dans les stats (Source des commandes).
alter type order_source add value if not exists 'comptoir';
notify pgrst, 'reload schema';
```
- **Client « Comptoir »** : PAS de nouvelle table. Upsert paresseux d'un `customers` sentinelle par resto
  dans l'action POS : `phone = 'comptoir'` (unique `(restaurant_id, phone)` → un seul par resto),
  `chat_id = 'comptoir'` (non routable — le notifier best-effort échouera silencieusement, c'est voulu :
  pas de WhatsApp pour un anonyme), `name = 'Comptoir'`, `marketing_opt_in = false`, `opted_out = true`
  (jamais dans une campagne).
- `apps/web/src/lib/stats.ts` `sourceSplit` : ajouter `{ source: 'comptoir', label: 'Comptoir' }` à l'ordre
  fixe (+ test).

## Part A — Board Commandes enrichi

**Files :** `apps/web/src/app/app/commandes/{page.tsx, board.tsx, shared.ts, actions.ts}`.

1. **Chargement des articles** : `page.tsx` charge en plus `order_items(name, qty, unit_price,
   order_item_supplements(name, price))` pour les commandes affichées. Le type `OrderCard` gagne `items`.
2. **Helper pur** `shared.ts` : `orderItemsSummary(items): string` → « 2× Poulet DG +Sauce · 1× Frites »
   (nom, qté, suppléments compacts, séparateur ` · `, tronqué proprement). Testé.
3. **Colonne Détails** (desktop) : le résumé sur une ligne, tronqué (`truncate`, plein détail au survol
   `title` ou dans le dialog existant). Sur mobile, il s'affiche dans la carte empilée (le board a déjà un
   layout responsive — l'y intégrer sans déborder, cf. leçons responsive).
4. **Colonne Imprimer** : bouton icône 🖨️ → ouvre `/app/commandes/[id]/ticket?print=1` (nouvel onglet ou
   navigation). `aria-label="Imprimer le ticket"`, cible tactile ≥44px sur mobile.
5. **Dropdown de statut** (colonne Action) : remplace le bouton « avancer » par un select des 5 statuts
   (`Reçue · En préparation · Prête · Récupérée · Annulée`, libellés `ORDER_STATUS_LABELS`) → au choix,
   `updateOrderStatus(o.id, status)`. `Annulée` déclenche la même logique que `cancelOrder` (ou passe par
   `updateOrderStatus` avec `annulee` — vérifier qu'aucun effet de bord de `cancelOrder` n'est perdu ;
   sinon router `annulee` vers `cancelOrder`). Confirmation seulement pour `Annulée` (destructif).
   La grille de colonnes du board s'ajuste (2 colonnes en plus : Détails large, Imprimer étroite).

## Part B — Caisse « Sur Place » (`/app/commandes/sur-place`)

**Files :** Create `apps/web/src/app/app/commandes/sur-place/{page.tsx, pos.tsx, actions.ts, cart.ts}` (+ test `cart.ts`).
Modify `commandes/page.tsx` (bouton « Sur Place »).

- **`page.tsx`** (Server Component) : garde membre ; charge le menu complet du resto (catégories triées →
  plats dispo avec prix + suppléments dispo). Passe **les données** à `<Pos>` (jamais de fonction).
- **`cart.ts`** (PUR, testé) : modèle de panier POS + helpers :
  `addLine`, `removeLine`, `setQty`, `toggleSupplement`, `cartTotal(cart, menu)`, `toCreateOrderItems(cart)`
  → `[{ menu_item_id, qty, supplement_ids }]` (le contrat `create_order`). Un « line » = un plat +
  ensemble de suppléments choisis ; deux ajouts du même plat avec suppléments différents = deux lignes.
- **`pos.tsx`** (client) : catégories (onglets/colonne, réutiliser `PageTabs` ou une nav simple) ; plats en
  **grille tap-pour-ajouter** (grosse cible tactile) ; à l'ajout d'un plat à suppléments → **mini-sélecteur**
  (cases) avant d'ajouter au panier ; **panier** à droite (lignes, qté +/−, total live) ; champ **téléphone
  optionnel** ; bouton **Valider**. Mobile : panier en bas repliable (l'écran comptoir est souvent une
  tablette portrait). Tokens du thème, cibles ≥44px.
- **`actions.ts`** — `createCounterOrder(formData)` :
  - garde membre + resto ; parse le panier (JSON) + téléphone optionnel ;
  - **résolution client** : téléphone renseigné → upsert `customers` réel (comme la LP, `onConflict
    restaurant_id,phone`, `marketing_opt_in` selon un choix simple : `true` par défaut pour un client qui
    donne son numéro au comptoir — cohérent avec l'opt-in implicite de la roue) ; vide → upsert le client
    **« Comptoir »** sentinelle du resto ;
  - `create_order(p_restaurant_id, p_customer_id, p_source: 'comptoir', p_mode: 'sur_place', p_items, null, null)` ;
  - renvoie l'`orderId` → le client redirige vers `/app/commandes/[id]/ticket?print=1`.
  - Validation : panier non vide, plats appartenant au resto (create_order revalide de toute façon —
    plats indisponibles → erreur FR).

## Part C — Ticket réutilisable (`/app/commandes/[id]/ticket`)

**Files :** Create `apps/web/src/app/app/commandes/[id]/ticket/{page.tsx, print-on-load.tsx}`, `apps/web/src/app/app/commandes/[id]/ticket/ticket.css` (ou classes Tailwind print).

- **`page.tsx`** (Server Component) : garde membre + commande appartenant au resto du membre (filtre
  `restaurant_id`, RLS). Charge commande + `order_items(+ suppléments)` + nom/infos resto. Rend un **reçu**
  format ticket : en-tête (nom resto, éventuel téléphone/adresse), n° commande + date/heure Libreville,
  mode (Sur place/Drive/Livraison), **liste articles** (qté × nom, suppléments en sous-lignes, prix aligné
  `tabular-nums`), **TOTAL**, pied (« Merci ! »). Largeur type reçu (`max-w-[80mm]`), typographie compacte.
- **CSS d'impression** : `@media print` masque le shell de l'app (`@page { margin: 0 }`, cache la sidebar/
  header — cible via une classe sur le body ou un layout dédié), le ticket occupe la page. `@media screen`
  affiche un aperçu centré + un bouton **« Imprimer »** (client) qui appelle `window.print()`.
- **`print-on-load.tsx`** (client) : si `?print=1`, appelle `window.print()` au montage (après peinture,
  `setTimeout(…, 300)` pour laisser le rendu). Sinon, l'utilisateur clique « Imprimer ».
- Servie par le 🖨️ du board ET la fin du flux Sur Place.

## Tests

- Purs : `orderItemsSummary` (0/1/n articles, suppléments, troncature) ; `cart.ts` (add/remove/qty/toggle
  supplément, `cartTotal`, `toCreateOrderItems` — 2 lignes distinctes pour mêmes plats/suppléments
  différents) ; `sourceSplit` inclut `comptoir`.
- Actions/pages : non testées unitairement (pattern web) → build + typecheck verts.

## Sécurité / cohérence

- Aucun endpoint public ajouté. Ticket et POS derrière la garde membre + RLS (filtre `restaurant_id`).
- Le client « Comptoir » n'est jamais routable (chat_id sentinelle) ni marketé (`opted_out=true`).
- `create_order` revalide dispo/prix côté SQL → pas de commande à prix incohérent depuis le POS.
- Jamais de prop fonction Server→Client. FR partout. Tokens du thème (pas de couleur en dur).

## Hors périmètre

- Paiement / encaissement (le modèle reste « à régler à la remise » — le total figure sur le ticket).
- Impression matérielle directe (ESC/POS) — on passe par la boîte d'impression du navigateur.
- Modification d'une commande comptoir après création (elle suit le flux de statut normal du Kanban).

## Déploiement

Migration 0031 via MCP + `notify pgrst` + round-trip (enum). Merge main ; Netlify (web uniquement — le bot
n'est pas touché). Smoke Franck : Sur Place → ajouter plats + suppléments → (option numéro) → Valider →
ticket s'imprime → la commande apparaît sur le Kanban avec le détail, le 🖨️ réimprime, le dropdown change
le statut.
