# Spec — Système de livraison + vérification commande

Date : 2026-07-17. Migration : `20260717000032`. Touche **web uniquement** (le bot n'est pas modifié —
l'envoi Whapi au livreur se fait depuis une server action web, comme réglages/sondages/chaîne).

## Intention

1. **Sidebar** : Menu remonte juste sous Commandes ; nouveau lien « 🛵 Livraison ».
2. **Livraison** : attribuer chaque commande `livraison` à un livreur enregistré, et lui **envoyer par
   WhatsApp** le détail de la commande + un **itinéraire Google Maps et Waze** vers le client.
3. **Table `deliveries`** : toute commande `livraison` y entre automatiquement (file d'attente).
4. **Vérification** : dans le modal d'une commande, contacter le client (Appeler / WhatsApp) et **marquer
   la commande « validée »** (jugement humain : la commande est réelle) → **badge « ✓ Validée »** sur la ligne.

## Décisions produit (validées avec Franck)

- **Livreurs** : liste gérée (table `livreurs`, CRUD dans Réglages). Pas de saisie à la volée.
- **Attribution** : manuelle (le resto choisit le livreur et clique « Envoyer »). Pas d'auto-assignation.
- **« Validée »** = confirmée par appel/WhatsApp — champ `orders.verified_at` posé au clic, **indépendant du
  statut Kanban**.

## Réutilisé (rien à réinventer)

- **Envoi Whapi depuis le web** : `decryptToken(channel.token_encrypted, TOKEN_ENCRYPTION_KEY)` +
  `new WhapiClient(token).sendText(...)` — pattern identique à `reglages/actions.ts:103-109`,
  `marketing/chaine/channel-token.ts`, `marketing/sondages/actions.ts`.
- **Supabase Realtime** (`postgres_changes` + `router.refresh()`) — pattern `commandes/board.tsx:97-106`.
- **PageTabs** pour la section Réglages (`reglages/page.tsx`).
- **`OrderCard`** (`lib/orders.ts`) + `commandes/page.tsx` (chargement) + `board.tsx` (modal).
- Format téléphone : `normalizeGabonPhone` (`lib/lp/wa.ts`) ; chat_id `${phone}@s.whatsapp.net`.

## Données (migration 0032)

```sql
-- 1) Livreurs (liste gérée par resto)
create table public.livreurs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text not null,               -- normalisé Gabon à l'écriture (server action)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.livreurs(restaurant_id) where active;

-- 2) Livraisons (une ligne par commande mode='livraison')
create type delivery_dispatch_state as enum ('pending', 'assigned', 'delivered');
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  livreur_id uuid references public.livreurs(id) on delete set null,
  dispatch_state delivery_dispatch_state not null default 'pending',
  assigned_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.deliveries(restaurant_id, dispatch_state);

-- 3) Trigger : toute commande livraison entre dans deliveries
create or replace function public.create_delivery_for_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mode = 'livraison' then
    insert into public.deliveries (restaurant_id, order_id)
    values (new.restaurant_id, new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
create trigger trg_create_delivery
  after insert on public.orders
  for each row execute function public.create_delivery_for_order();

-- 4) Backfill des commandes livraison existantes
insert into public.deliveries (restaurant_id, order_id)
select o.restaurant_id, o.id from public.orders o
where o.mode = 'livraison'
on conflict (order_id) do nothing;

-- 5) Vérification commande
alter table public.orders add column verified_at timestamptz;

-- 6) RLS (helper projet is_member(restaurant_id) — pattern identique à menu_supplements 0014)
alter table public.livreurs enable row level security;
alter table public.deliveries enable row level security;
create policy tenant_all_livreurs on public.livreurs for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_deliveries on public.deliveries for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

notify pgrst, 'reload schema';
```

> `is_member(restaurant_id)` est le helper RLS du projet (cf. `menu_supplements` migration 0014). Les server
> actions écrivent via le client Supabase authentifié (RLS active) — pas de service_role nécessaire ici,
> contrairement à `create_order`.

- `deliveries` et `orders` ajoutés à la publication Realtime si nécessaire (les `orders` y sont déjà ;
  ajouter `deliveries` : `alter publication supabase_realtime add table public.deliveries;`).

## Part A — Sidebar (`apps/web/src/app/app/layout.tsx`)

Nouvel ordre du tableau `NAV` :
```
Accueil · Commandes · Menu · Livraison · Conversations · Statistiques · Marketing · Fidélité · Réglages
```
- `{ href: '/app/livraison', label: 'Livraison', icon: 'Bike' }` inséré après Menu.
- Menu (`/app/menu`) déplacé de sa position actuelle (après Statistiques) à juste après Commandes.
- Vérifier que l'icône `Bike` existe dans le mapping d'icônes (`nav-links`/`app-shell`) ; sinon l'ajouter
  (import lucide `Bike`).

## Part B — Livreurs : helpers + CRUD Réglages

**Helper pur** `apps/web/src/lib/delivery.ts` (testé) :
- `deliveryLinks(address: string, restaurantGps?: { lat: number; lng: number } | null): { maps: string; waze: string }`
  - Si `address` contient des coordonnées (`https://maps.google.com/?q=LAT,LNG` — format posé par le bot pour
    un partage de position GPS, cf. `processor.ts`), extraire `LAT,LNG` et bâtir :
    - `maps = https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` (+ `&origin=` si `restaurantGps`)
    - `waze = https://waze.com/ul?ll=LAT,LNG&navigate=yes`
  - Sinon (adresse texte libre) : `destination = encodeURIComponent(address)`,
    `waze = https://waze.com/ul?q=encodeURIComponent(address)`.
  - Tests : coords extraites, adresse texte encodée, adresse vide → liens de recherche génériques sans crash.
- `buildDeliveryMessage(order): string` — message FR au livreur (n°, client + tél, articles
  (`orderItemsSummary`), adresse, total, liens Maps + Waze). Pur, testé.

**CRUD Réglages** — nouvel onglet « Livreurs » dans `reglages/page.tsx` (PageTabs) :
- `reglages/livreurs-form.tsx` (client) : liste des livreurs (nom, tél, actif), formulaire d'ajout, boutons
  renommer / activer-désactiver. Cibles tactiles ≥44px, tokens du thème.
- Server actions dans `reglages/actions.ts` (ou `livreurs/actions.ts`) :
  `addLivreur(formData)` (normalise le tél, garde resto), `updateLivreur`, `toggleLivreurActive`.
  Garde membre + resto sur chaque action ; `revalidatePath('/app/reglages')` + `/app/livraison`.

## Part C — Page `/app/livraison`

**Files :** `apps/web/src/app/app/livraison/{page.tsx, board.tsx, actions.ts}`.

- **`page.tsx`** (Server Component) : garde membre ; charge les `deliveries` du resto jointes à
  `orders(order_number, total, delivery_address, created_at, verified_at, customers(name, phone),
  order_items(name, qty))` + `livreurs(name, phone)`, et la liste des **livreurs actifs** + le GPS resto
  (pour l'origine d'itinéraire). Passe les **données** à `<DeliveryBoard>` (jamais de prop fonction).
- **`board.tsx`** (client) : 3 colonnes/sections — **À attribuer** (`pending`), **En course** (`assigned`),
  **Livrées** (`delivered`). Par carte : n°, client + tél, adresse, articles, total ; badge « ✓ Validée » si
  `verified_at`. Realtime `deliveries` + `orders` → `router.refresh()` (pattern board commandes ; **`const x =
  initialProp`, jamais `useState(initialProp)`** — cf. leçon Kanban figé).
  - `pending` : `<select>` livreur actif + bouton **« Envoyer au livreur »** → `assignDelivery(deliveryId, livreurId)`.
  - `assigned` : rappel du livreur + bouton **« Marquer livrée »** → `markDelivered(deliveryId)`, et
    **« Renvoyer »** (ré-`assignDelivery`, best-effort).
- **`actions.ts`** :
  - `assignDelivery(deliveryId, livreurId)` : garde membre + resto (via jointure `deliveries.restaurant_id`
    ∈ mes restos) ; charge order+client+resto+livreur ; construit `buildDeliveryMessage` + `deliveryLinks` ;
    décrypte le token canal, `WhapiClient.sendText(livreurChatId, message)` ; **best-effort** — si l'envoi
    échoue (401 Whapi déconnecté, réseau), on **met quand même** `livreur_id`/`assigned_at`/`assigned` et on
    renvoie un `{ ok:false, error }` pour un toast FR « Livreur assigné, mais l'envoi WhatsApp a échoué
    (canal déconnecté ?) ». (L'attribution ne doit pas être bloquée par l'état du canal.)
  - `markDelivered(deliveryId)` : `dispatch_state='delivered'`, `delivered_at=now`. Garde resto.
  - Toutes : `revalidatePath('/app/livraison')`.

## Part D — Vérification (modal commandes + badge)

**Files :** `commandes/actions.ts` (+ `verifyOrder`), `commandes/board.tsx` (modal + badge),
`commandes/page.tsx` (select `verified_at`), `lib/orders.ts` (`OrderCard.verified_at`).

- `lib/orders.ts` : `OrderCard` gagne `verified_at: string | null`.
- `commandes/page.tsx` : ajouter `verified_at` au select et au mapping `OrderCard`.
- `commandes/actions.ts` : `verifyOrder(orderId, verified: boolean)` → `update orders set verified_at =
  (verified ? now() : null)` (garde resto via RLS) ; `revalidatePath('/app/commandes')`.
- `board.tsx` modal (`DialogFooter` ou une zone dédiée) :
  - **« 📞 Appeler »** : lien `tel:${customer_phone}` (bouton `asChild` `<a>`).
  - **« 💬 WhatsApp »** : lien `https://wa.me/${digits(customer_phone)}` (nouvel onglet).
  - **« ✓ Marquer validée »** / **« Annuler validation »** selon `selected.verified_at` → `verifyOrder`.
- **Badge** « ✓ Validée » (vert, `--tint-mint`/emerald, style cohérent avec les badges existants) sur la
  carte de commande dans le board quand `verified_at != null`. Helper d'affichage pur si utile.

## Tests

- Purs (vitest) : `deliveryLinks` (coords extraites / adresse texte / vide), `buildDeliveryMessage`
  (articles + liens présents, échappement). Réutiliser `orderItemsSummary` (déjà testé).
- Actions/pages : non testées unitairement (pattern web) → **build + typecheck verts** ; smoke manuel.

## Sécurité / cohérence

- Aucun endpoint public. Tout derrière la garde membre + RLS (filtre `restaurant_id`).
- Le numéro du livreur n'est **jamais** un client marketé : `livreurs` est une table séparée, hors
  `customers` (pas d'opt-in, pas de campagnes).
- Jamais de prop fonction Server→Client. FR partout. Tokens du thème (pas de couleur en dur).
- `assignDelivery` best-effort sur l'envoi : l'état d'attribution est écrit même si Whapi est down.
- Ne jamais mettre le téléphone du client/livreur dans une URL de query côté navigation interne (les liens
  `tel:`/`wa.me`/Maps/Waze sont des actions utilisateur explicites, autorisées).

## Hors périmètre (v1)

- Confirmation de livraison **par le livreur** via WhatsApp (round-trip bouton, façon arrivée Drive) — noté
  pour plus tard ; v1 = le resto clique « Marquer livrée ».
- Attribution automatique (round-robin / disponibilité livreur).
- Suivi GPS temps réel du livreur, frais de livraison, encaissement.
- Géocodage d'adresse (les deep links Maps/Waze acceptent une requête texte).

## Déploiement

Migration 0032 via MCP Supabase + `notify pgrst` + `alter publication` Realtime. Merge main ; Netlify (web
uniquement). Whapi actuellement déconnecté → l'envoi au livreur renverra 401 jusqu'à reconnexion, mais
l'attribution et toute l'UI fonctionnent. Smoke Franck : ajouter un livreur (Réglages) → une commande
livraison apparaît dans /livraison → attribuer + envoyer → statut « en course » → « livrée » ; sur
/commandes, ouvrir une commande → Appeler/WhatsApp client → Marquer validée → badge « ✓ Validée » sur la ligne.
