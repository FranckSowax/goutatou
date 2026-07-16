# Caisse Sur Place (POS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal :** prendre une commande au comptoir en quelques taps et imprimer un ticket ; enrichir le board (détails, impression, dropdown de statut).

**Architecture :** 100 % web (le bot n'est pas touché). La caisse et le ticket réutilisent `create_order` (contrat suppléments identique à la LP) et le Realtime/overlay cuisine déjà en place. Le ticket est une page dédiée imprimée via `window.print()`.

**Tech Stack :** Next 15 App Router, Supabase (create_order RPC + RLS), Tailwind 4.

**Spec :** `docs/superpowers/specs/2026-07-13-pos-comptoir-design.md`.

## Faits du code (vérifiés — à respecter)

- **Les suppléments sont des `order_items`** : `create_order` insère la ligne plat puis des lignes `↳ <supplément>` adjacentes (migration 0015). `commandes/page.tsx` charge **déjà** `order_items(name, qty, unit_price)` et les mappe sur `OrderCard.items`. → Détails & ticket = rendre `items` dans l'ordre ; les lignes commençant par `↳ ` sont des suppléments. **Aucune table `order_item_supplements` (elle n'existe pas).**
- Helpers statuts/labels dans **`apps/web/src/lib/orders.ts`** (`OrderCard`, `ORDER_STATUS_LABELS`, `ADVANCE_LABELS`, `groupByStatus`, `nextStatus`), PAS dans un `shared.ts`.
- `cancelOrder(id)` = `updateOrderStatus(id, 'annulee')` — **zéro effet de bord** → le dropdown peut router tous les statuts par `updateOrderStatus`.
- `order_source` = enum `('whatsapp','web')`.

## Global Constraints

- Migration `20260713000031`, `notify pgrst` après DDL. **`alter type … add value` doit être seul** (Postgres interdit ADD VALUE puis usage dans la même transaction — le mettre dans SA migration, appliqué avant tout code qui écrit `'comptoir'`).
- Réutiliser `create_order` (`p_items = [{ menu_item_id, qty, supplement_ids? }]`, `p_source`, `p_mode`), `updateOrderStatus`. Ne PAS réécrire la logique de commande.
- Client « Comptoir » : upsert paresseux `customers` (`phone='comptoir'`, `chat_id='comptoir'`, `name='Comptoir'`, `marketing_opt_in=false`, `opted_out=true`), un par resto via `onConflict restaurant_id,phone`.
- Jamais de prop fonction Server→Client. FR partout. Tokens du thème, aucune couleur en dur. Cibles tactiles ≥44px sur mobile (l'écran comptoir est une tablette). Le ticket ne fuit jamais hors du resto du membre (garde + RLS).

---

## Task POS1 — Migration 0031 + helpers purs (résumé + panier)

**Files :** Create `supabase/migrations/20260713000031_order_source_comptoir.sql` ; Modify `apps/web/src/lib/orders.ts`, `apps/web/src/lib/stats.ts` ; Create `apps/web/src/app/app/commandes/sur-place/cart.ts` ; Test `apps/web/test/orders-summary.test.ts`, `apps/web/test/pos-cart.test.ts`, + le test stats existant.

**Migration** (idempotente, SEULE) :
```sql
alter type order_source add value if not exists 'comptoir';
notify pgrst, 'reload schema';
```
Ne PAS appliquer en prod (POS5).

**`lib/orders.ts`** — ajouter (PUR) :
```ts
/** Résumé compact des articles d'une commande pour la colonne Détails. Les lignes `↳ …` sont des
 *  suppléments, rattachés au plat précédent. Ex. « 2× Poulet DG +Sauce · 1× Frites ». */
export function orderItemsSummary(items: { name: string; qty: number }[]): string
```
Règles : un plat = `qty× nom` ; une ligne `↳ X` → ` +X` accolé au plat précédent ; join ` · ` ; `''` si aucun article. Tests : `[]`→'' ; 1 plat → '2× Poulet DG' ; plat + `↳ Sauce` → '2× Poulet DG +Sauce' ; 2 plats → 'A · B' ; supplément orphelin en tête (défensif) → ignoré ou rendu tel quel sans crash.

**`lib/stats.ts`** `sourceSplit` : ajouter `{ source: 'comptoir', label: 'Comptoir' }` à l'ordre fixe (après web). Test : une commande `comptoir` comptée sous « Comptoir » ; ordre whatsapp/web/comptoir.

**`sur-place/cart.ts`** (PUR) — modèle panier POS :
```ts
export interface PosLine { key: string; menuItemId: string; name: string; unitPrice: number; qty: number; supplements: { id: string; name: string; price: number }[] }
export interface PosCart { lines: PosLine[] }
export function addLine(cart: PosCart, item: { menuItemId: string; name: string; unitPrice: number }, supplements: { id: string; name: string; price: number }[]): PosCart
export function setQty(cart: PosCart, key: string, qty: number): PosCart   // qty<=0 retire la ligne
export function removeLine(cart: PosCart, key: string): PosCart
export function cartTotal(cart: PosCart): number   // Σ qty*(unitPrice + Σ supplément.price)
export function toCreateOrderItems(cart: PosCart): { menu_item_id: string; qty: number; supplement_ids?: string[] }[]
```
`key` = déterministe à partir de menuItemId + ids de suppléments triés (deux ajouts du même plat avec suppléments différents = 2 lignes ; même plat mêmes suppléments = fusion des qté). Tests : addLine crée une ligne ; ré-ajout même plat+mêmes suppléments → qty+1 (1 ligne) ; même plat suppléments différents → 2 lignes ; setQty 0 → retire ; cartTotal avec suppléments ; toCreateOrderItems omet `supplement_ids` si vide.

**Vérifie** : `pnpm --filter @goutatou/web test` + typecheck. Commit `feat(web,db): migration 0031 comptoir + helpers résumé/panier POS`.

---

## Task POS2 — Board enrichi (Détails, Imprimer, dropdown statut)

**Files :** Modify `apps/web/src/app/app/commandes/board.tsx`, `apps/web/src/app/app/commandes/page.tsx` (bouton « Sur Place »).

**Consomme :** `orderItemsSummary` (POS1), `ORDER_STATUS_LABELS`/`OrderCard` (`lib/orders.ts`), `updateOrderStatus`/`cancelOrder` (`actions.ts`). `items` est déjà chargé sur `OrderCard`.

1. **Colonne Détails** : nouvelle colonne (desktop) affichant `orderItemsSummary(o.items)` en `truncate` avec le résumé complet en `title`. Ajuster la grille de colonnes du board (aujourd'hui `md:grid-cols-[6.5rem_7rem_1fr_1fr_8rem_9rem_7.5rem]`) pour insérer Détails (large, `1.5fr`) et Imprimer (étroite, `3rem`) sans déborder — teste mentalement à largeur `lg`. Sur mobile (carte empilée), afficher le résumé sous le client.
2. **Colonne Imprimer** : bouton icône imprimante (`lucide-react` `Printer`) → `window.open('/app/commandes/'+o.id+'/ticket?print=1')` OU un `<a href target=_blank>`. `aria-label="Imprimer le ticket"`, `size` tactile. `onClick` stopPropagation (la ligne est cliquable).
3. **Dropdown de statut** (colonne Action) : remplacer le bouton « avancer » par un `<Select>` (shadcn) listant les 5 statuts via `ORDER_STATUS_LABELS`, valeur courante = statut de la commande. Au changement → si `annulee` : `confirm()` FR (« Annuler la commande n°X ? ») puis `updateOrderStatus(o.id,'annulee')` ; sinon `updateOrderStatus(o.id, s)` directement. `onClick`/`onChange` stopPropagation. Le dropdown doit rester utilisable sans ouvrir le dialog de la ligne.
   Garder le dialog de détail existant (clic sur la ligne) — ne pas le casser.
4. **Bouton « Sur Place »** dans l'en-tête de `page.tsx` (près du titre/filtres) → `<Link href="/app/commandes/sur-place">` avec une icône, style primaire, cible tactile.

**Vérifie** : `pnpm --filter @goutatou/web test` + typecheck + build. Commit `feat(web): board commandes — détails, impression, dropdown statut, bouton Sur Place`.

---

## Task POS3 — Ticket imprimable (`/app/commandes/[id]/ticket`)

**Files :** Create `apps/web/src/app/app/commandes/[id]/ticket/page.tsx`, `apps/web/src/app/app/commandes/[id]/ticket/print-on-load.tsx`, `apps/web/src/app/app/commandes/[id]/ticket/ticket-print.css` (ou classes Tailwind + `@media print`).

- **`page.tsx`** (Server Component) : garde membre ; charge la commande **filtrée par `restaurant_id` du membre** (RLS + filtre explicite) avec `order_number, status, mode, total, created_at, delivery_address, customers(name), drive_slots(label), order_items(name, qty, unit_price)` (ordonnés par `position`), + `restaurants(name, contact_phone)`. Commande introuvable/autre resto → page « Ticket indisponible. ».
- **Rendu reçu** : conteneur `max-w-[80mm] mx-auto` fond blanc, texte noir compact : en-tête nom resto (+ tél si présent), n° commande gros, date/heure Libreville (`toLocaleString('fr-FR', { timeZone:'Africa/Libreville' })`), libellé mode (`ORDER_STATUS_LABELS` non — utiliser un libellé mode : Sur place/Drive/Livraison + détail créneau/adresse), **lignes articles** : `qty× nom` avec prix aligné à droite `tabular-nums`, les lignes `↳ …` (suppléments) indentées et en plus petit, **TOTAL** en gras (`formatFcfa`), pied « Merci ! ». Ce ticket **ne dépend pas** du thème sombre : forcer fond blanc / texte noir (impression).
- **CSS impression** (`@media print`) : `@page { margin: 6mm }` ; **masquer le shell de l'app** — le layout `/app` a une sidebar/header ; ajoute une classe sur le conteneur racine du ticket et une règle `@media print { body :where(.app-shell, header, nav, aside){ display:none } .ticket-print{ … } }` OU, plus propre, mets la page ticket **hors du layout `/app`** si possible (sinon cible les éléments du shell). L'implémenteur choisit la voie la plus fiable et **documente**. `@media screen` : aperçu centré + bouton **« Imprimer »** (client) → `window.print()`.
- **`print-on-load.tsx`** (client) : si `searchParams.print === '1'`, `window.print()` au montage après `setTimeout(300)`.

**Vérifie** : build + typecheck verts (rendu réel = smoke). Commit `feat(web): ticket de commande imprimable (format reçu)`.

---

## Task POS4 — Caisse Sur Place (`/app/commandes/sur-place`)

**Files :** Create `apps/web/src/app/app/commandes/sur-place/page.tsx`, `apps/web/src/app/app/commandes/sur-place/pos.tsx`, `apps/web/src/app/app/commandes/sur-place/actions.ts`.

**Consomme :** `cart.ts` (POS1), le ticket (POS3), `create_order`.

- **`page.tsx`** (Server Component) : garde membre + resto ; charge le menu complet (`menu_categories` triées → `menu_items` dispo `id,name,price` + `menu_supplements` dispo `id,name,price`). Passe les données à `<Pos restaurantId menu={…} />`. Regarde `apps/web/src/lib/lp/data.ts` ou `app/menu/page.tsx` pour la forme du menu.
- **`pos.tsx`** (client) : catégories (nav horizontale, réutiliser le style `PageTabs`/`marketing-tabs`), plats de la catégorie active en **grille de gros boutons** (nom + prix) → tap : si le plat a des suppléments, ouvrir un mini-sélecteur (Dialog/panneau, cases suppléments) puis « Ajouter » ; sinon `addLine(cart, item, [])` direct. **Panier** (colonne droite sur `lg`, tiroir repliable en bas sur mobile) : lignes avec `+`/`−` (`setQty`), suppléments listés sous le plat, `cartTotal` en direct. Champ **téléphone optionnel** (placeholder `+241 …`). Bouton **Valider** (désactivé si panier vide) → `createCounterOrder`.
  Au succès → `router.push('/app/commandes/'+orderId+'/ticket?print=1')`. Erreur → message FR.
- **`actions.ts`** — `createCounterOrder(formData)` (`'use server'`) :
  - garde membre → `restaurantId` ; parse `items` (JSON du `toCreateOrderItems`) et `phone` optionnel ; panier vide → throw « Panier vide. » ;
  - **client** : `phone` non vide → `normalizeGabonPhone` (helper existant `@/lib/lp/wa`) ; invalide → throw « Numéro invalide. » ; valide → upsert `customers` réel (`onConflict restaurant_id,phone`, `chat_id = \`${phone}@s.whatsapp.net\``, `marketing_opt_in:true`, `opted_out:false`). `phone` vide → upsert le client **« Comptoir »** (`phone:'comptoir', chat_id:'comptoir', name:'Comptoir', marketing_opt_in:false, opted_out:true`, `onConflict restaurant_id,phone`) ;
  - `db.rpc('create_order', { p_restaurant_id, p_customer_id, p_source:'comptoir', p_mode:'sur_place', p_items, p_drive_slot_id:null, p_delivery_address:null })` ; erreur/0 ligne → throw « Commande impossible (plats indisponibles ?). » ;
  - renvoie `{ orderId }`.

**Vérifie** : build + typecheck + test verts. Commit `feat(web): caisse Sur Place (POS) — panier tactile + création commande comptoir`.

---

## Task POS5 — Revue + prod + deploy

1. `pnpm --filter @goutatou/web test` + typecheck + build verts.
2. Revue finale (modèle capable) via `scripts/review-package`. Cibler : multi-tenant du ticket et de `createCounterOrder` (jamais la commande d'un autre resto) ; `create_order` bien source de vérité des prix (pas de total falsifiable depuis le POS) ; client Comptoir jamais routable/marketé ; dropdown statut ne casse pas le dialog de ligne ni le Realtime ; impression masque bien le shell ; aucune couleur en dur ; cibles tactiles.
3. Migration 0031 prod via MCP + `notify pgrst` + round-trip (enum `comptoir` présent).
4. Merge `feature/pos-comptoir` → main, push. **Netlify uniquement** (bot inchangé).
5. Ledger + mémoire.
6. Smoke Franck : Commandes → « Sur Place » → catégories + plats + suppléments → (option numéro) → Valider → ticket s'imprime → la commande apparaît sur le Kanban avec détails + overlay cuisine → 🖨️ réimprime → dropdown change le statut → source « Comptoir » visible dans Stats.

## Self-review (couverture spec)
- Colonne Détails → POS1 (helper) + POS2 ✓ ; Imprimer → POS2 (bouton) + POS3 (route) ✓ ; dropdown statut → POS2 ✓.
- Caisse Sur Place (catégories/plats/suppléments/panier/valider) → POS1 (cart) + POS4 ✓.
- Client Comptoir + téléphone optionnel → POS4 ✓ ; source comptoir + stats → POS1 ✓.
- Ticket reçu + impression navigateur → POS3 ✓.
- Migration 0031 → POS1/POS5 ✓. Bot non touché ✓.
