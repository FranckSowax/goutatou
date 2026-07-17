# Livraison + Vérification — Plan d'implémentation

> **Pour agents :** exécuter tâche par tâche. Web uniquement (le bot n'est pas touché). Spec :
> `docs/superpowers/specs/2026-07-17-livraison-verification-design.md`.

**Goal :** attribuer les commandes livraison à des livreurs enregistrés + leur envoyer commande & itinéraire
par WhatsApp, et permettre de vérifier une commande (appel/WhatsApp client) avec badge « ✓ Validée ».

**Architecture :** Next 15 App Router (Server Components + server actions), Supabase (RLS `is_member`),
Realtime `router.refresh()`, envoi Whapi depuis le web (`decryptToken` + `WhapiClient.sendText`).

## Global Constraints

- FR partout. Tokens du thème (aucune couleur en dur). Cibles tactiles ≥44px.
- Jamais de prop fonction Server→Client (passer des données).
- RLS via helper `is_member(restaurant_id)` (cf. migration 0014). Server actions = client Supabase
  authentifié (pas de service_role).
- Migration : `20260717000032`. Appliquée via MCP Supabase + `notify pgrst` + `alter publication`.
- `const x = initialProp` dans les boards Realtime, **jamais** `useState(initialProp)` (leçon Kanban figé).

---

### Task L1 : Migration 0032 (schéma livraison + vérification)

**Files :** Create `supabase/migrations/20260717000032_livraison_verification.sql`. Appliquer via MCP
`apply_migration`. Régénérer les types si le projet a un fichier de types généré.

Contenu = bloc SQL de la spec § Données (livreurs, delivery_dispatch_state, deliveries, trigger
`create_delivery_for_order`, backfill, `orders.verified_at`, RLS `tenant_all_*` via `is_member`,
`alter publication supabase_realtime add table public.deliveries`, `notify pgrst`).

- [ ] Écrire le fichier de migration (idempotent : `if not exists` / `on conflict do nothing`).
- [ ] Appliquer via MCP sur `vaowvldazfcmietacctz`.
- [ ] Vérifier : `deliveries` peuplée pour les commandes livraison existantes (backfill), trigger présent.

### Task L2 : Helpers purs `lib/delivery.ts` (TDD)

**Files :** Create `apps/web/src/lib/delivery.ts`, Test `apps/web/test/delivery.test.ts`.

**Produces :**
- `deliveryLinks(address: string, restaurantGps?: {lat:number;lng:number}|null): { maps: string; waze: string }`
- `buildDeliveryMessage(o: { order_number:number; customer_name:string|null; customer_phone:string;
  delivery_address:string|null; total:number; items:{name:string;qty:number}[] }, links:{maps:string;waze:string}): string`

- [ ] Test : `deliveryLinks('https://maps.google.com/?q=0.39,9.45')` → maps `dir/?api=1&destination=0.39,9.45`,
  waze `ul?ll=0.39,9.45&navigate=yes`.
- [ ] Test : `deliveryLinks('Quartier Louis, Libreville')` → destination/`q=` encodés (`encodeURIComponent`).
- [ ] Test : `deliveryLinks('')` → liens sans crash (recherche générique).
- [ ] Test : `deliveryLinks(addr, {lat:0.4,lng:9.4})` → `&origin=0.4,9.4` ajouté au lien Maps.
- [ ] Test : `buildDeliveryMessage` contient n°, tél client, `orderItemsSummary(items)`, adresse, total FCFA,
  les 2 liens.
- [ ] Implémenter (réutiliser `orderItemsSummary` de `lib/orders.ts`, `formatFcfa` de `@goutatou/db`).
- [ ] `pnpm --filter @goutatou/web test` vert.

### Task L3 : Sidebar (réordonner + Livraison)

**Files :** Modify `apps/web/src/app/app/layout.tsx` (tableau `NAV`), `apps/web/src/components/nav-links.tsx`
(ajouter `Bike` à l'import lucide + à l'objet `ICONS`).

- [ ] `NAV` : ordre `Accueil, Commandes, Menu, Livraison, Conversations, Statistiques, Marketing, Fidélité,
  Réglages`. Item `{ href: '/app/livraison', label: 'Livraison', icon: 'Bike' }`.
- [ ] `nav-links.tsx` : `import { …, Bike } from 'lucide-react'` + `Bike` dans `ICONS`.
- [ ] Typecheck vert.

### Task L4 : Livreurs (CRUD Réglages)

**Files :** Create `apps/web/src/app/app/reglages/livreurs-form.tsx`; Modify `reglages/page.tsx` (onglet
« Livreurs » via PageTabs + chargement `livreurs`), `reglages/actions.ts` (actions).

**Produces :** `addLivreur(formData)`, `updateLivreur(id, formData)`, `toggleLivreurActive(id, active)`.

- [ ] `page.tsx` : ajouter `'livreurs'` à `REGLAGES_TABS`, charger `livreurs` du resto (tri `active desc,
  name`), rendre `<LivreursForm livreurs={…} />` sous l'onglet.
- [ ] `livreurs-form.tsx` (client) : liste (nom, tél, badge actif/inactif), champ ajout (nom + tél),
  boutons renommer / (dés)activer. `useTransition`, toasts FR, cibles ≥44px, tokens thème.
- [ ] `actions.ts` : garde membre+resto ; `addLivreur` normalise le tél (`normalizeGabonPhone`, rejet FR si
  invalide) ; `revalidatePath('/app/reglages')` + `revalidatePath('/app/livraison')`.
- [ ] Typecheck vert.

### Task L5 : Page `/app/livraison`

**Files :** Create `apps/web/src/app/app/livraison/{page.tsx, board.tsx, actions.ts}`.

**Consumes :** `deliveryLinks`, `buildDeliveryMessage` (L2) ; `orderItemsSummary` ; `WhapiClient` +
`decryptToken`.

- [ ] `page.tsx` (Server) : garde membre ; charge `deliveries` du resto jointes `orders(order_number, total,
  delivery_address, created_at, verified_at, customers(name, phone), order_items(name, qty))` +
  `livreurs(name, phone)` ; charge livreurs actifs + GPS resto. Passe données à `<DeliveryBoard>`.
- [ ] `board.tsx` (client) : 3 sections `pending`/`assigned`/`delivered`. `const rows = initialRows`.
  Realtime sur `deliveries` ET `orders` → `router.refresh()`. `pending` : `<select>` livreur + « Envoyer au
  livreur ». `assigned` : livreur + « Marquer livrée » + « Renvoyer ». Badge « ✓ Validée » si `verified_at`.
- [ ] `actions.ts` :
  - `assignDelivery(deliveryId, livreurId)` : garde resto ; charge order+client+resto+livreur ;
    `links = deliveryLinks(delivery_address, restoGps)` ; `msg = buildDeliveryMessage(...)` ; décrypte token
    canal + `WhapiClient.sendText(livreurChatId, msg)` en **best-effort** (try/catch) ; met TOUJOURS
    `livreur_id`, `assigned_at`, `dispatch_state='assigned'` ; renvoie `{ ok, error? }`.
  - `markDelivered(deliveryId)` : `delivered` + `delivered_at`. `revalidatePath('/app/livraison')`.
- [ ] Typecheck vert.

### Task L6 : Vérification (modal + badge)

**Files :** Modify `lib/orders.ts` (`OrderCard.verified_at`), `commandes/page.tsx` (select+map),
`commandes/actions.ts` (`verifyOrder`), `commandes/board.tsx` (modal boutons + badge ligne).

**Produces :** `verifyOrder(orderId: string, verified: boolean)`.

- [ ] `lib/orders.ts` : `OrderCard.verified_at: string | null`.
- [ ] `commandes/page.tsx` : `verified_at` au select + au mapping.
- [ ] `commandes/actions.ts` : `verifyOrder` → `update orders set verified_at = verified ? now() : null`
  (RLS) ; `revalidatePath('/app/commandes')`.
- [ ] `board.tsx` modal : boutons « 📞 Appeler » (`<a href="tel:…">` via Button asChild), « 💬 WhatsApp »
  (`https://wa.me/<digits>`, nouvel onglet), « ✓ Marquer validée » / « Annuler validation » → `verifyOrder`.
- [ ] `board.tsx` carte : badge vert « ✓ Validée » quand `verified_at`.
- [ ] Typecheck vert.

### Task L7 : Revue + vérif + déploiement

- [ ] `pnpm --filter @goutatou/web test` + `typecheck` verts.
- [ ] Preview (`preview_start`) : /reglages (livreurs), /livraison, /commandes (modal + badge) — captures.
- [ ] Revue opus (code-review) + vague de correctifs.
- [ ] Commit, push main (Netlify web). Migration déjà appliquée en prod (L1). Smoke Franck (cf. spec).

## Self-review

- Couverture spec : sidebar (L3), livreurs (L4), deliveries+trigger (L1), page livraison+envoi (L5),
  vérification+badge (L6). ✓
- Types cohérents : `OrderCard.verified_at` (L6) utilisé par board+page ; `deliveryLinks`/`buildDeliveryMessage`
  (L2) consommés par L5. ✓
- Pas de placeholder. ✓
