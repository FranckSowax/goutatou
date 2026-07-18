# Spec — Catalogue → panier pré-rempli → pixel (boucle traçable)

Date : 2026-07-18. Migration `20260718000034`. **Web uniquement** (LP publique + réglage) ; le bot
réutilise la même fabrique d'URL (léger). Objectif : qu'un clic depuis une pub catalogue Meta, un lien de
bot, un QR ou un e-mail ouvre la LP du resto **avec le bon plat déjà dans le panier**, tout étant traçable
(vue → ajout → achat) via le pixel Meta.

## Décisions produit (validées)

- **Pixel Meta par restaurant** (`restaurants.meta_pixel_id`), pas un pixel global.
- **Deep-link atterrit sur la carte** `/r/[slug]?add=<id>` (contexte + scroll vers Commander).
- **Périmètre : deep-link + pixel + fabrique d'URL unique + flux catalogue Meta (DPA)**.

## Contexte réutilisé (rien à réinventer)

- **Panier LP** : `CartProvider` (persistant localStorage, `@/components/lp/CartProvider`), modèle
  `@/lib/lp/cart` (`WebCartItem{menuItemId,name,unitPrice,supplements,qty}`, `cartReducer` dédup par
  `lineKey`), `AddToCartButton`, `CartBar` (`@/components/lp/CartBar`). Données via `getLpData(slug)`.
- **Catalogue** : `retailer_id = menu_item.id` (migration 0021) → **`toCatalogId()` = identité** (chez
  Goutatou, `storefront_id == catalog_id`), à centraliser malgré tout.
- Prix source de vérité = `menu_items.price` (FCFA). Pas de CSP custom sur la LP (pixel se charge librement).

## Invariant clé

**Une seule fabrique d'URL** `orderUrl(slug, menuItemId)` = `/r/{slug}?add=<id>`. Le `link` du flux
catalogue Meta ET tout lien « commander en ligne » du bot l'utilisent. `content_ids` (pixel) et `id` (flux)
passent TOUJOURS par `toCatalogId()` — sinon le catalogue et le pixel ne se parlent pas.

## Données (migration 0034)

```sql
alter table public.restaurants add column if not exists meta_pixel_id text;
notify pgrst, 'reload schema';
```
Le pixel id est **public** par nature (il finit dans le HTML de la LP) — pas un secret.

## Part A — Fabrique d'URL + mapping (purs, testés)

**Files :** `apps/web/src/lib/lp/order-url.ts` + test.
- `toCatalogId(menuItemId: string): string` — **identité** documentée (`menu_item.id` est déjà le
  `retailer_id`). Point d'extension unique si la convention change un jour.
- `orderUrl(baseUrl: string, slug: string, menuItemIds: string[], opts?: {qty?, mode?}): string` →
  `${baseUrl}/r/${slug}?add=${ids.join(',')}[&qty=][&mode=]`. Utilisée par le flux catalogue et le bot.
- Tests : id simple, plusieurs ids, options, encodage.

## Part B — Deep-link « ajouter au panier » sur `/r/[slug]`

**Files :** `apps/web/src/components/lp/DeepLinkAdd.tsx` (client) ; monté dans le layout/page LP sous le
`CartProvider` (là où `useCart` est dispo). `apps/web/src/lib/lp/deep-link.ts` (helper pur `parseAddParam`).

- `parseAddParam(raw, knownIds, maxLines)` (PUR, testé) : split virgules, trim, **garde seulement les ids
  connus**, dédup, plafond `MAX_LINES` (ex. 12). Renvoie la liste d'ids à ajouter.
- `DeepLinkAdd` (client) reçoit le catalogue `{ id → {name, price, ...} }` (depuis `getLpData`) :
  1. `useEffect` (une seule fois, garde `useRef` contre le double-run React) : lire `?add` via
     `useSearchParams`.
  2. `parseAddParam` → pour chaque id : `addItem({ menuItemId, name, unitPrice, supplements:[] })` +
     `track('AddToCart', { content_ids:[toCatalogId(id)], content_type:'product', currency:'XAF', value })`.
  3. **Idempotence** : après traitement, retirer `?add` de l'URL via `history.replaceState` (ou
     `router.replace` sans le param) → un rechargement ne ré-ajoute pas (panier persistant).
  4. Si ≥1 ajout : ouvrir/scroller vers `CartBar` (`scrollIntoView`, `behavior` = `smooth` sauf
     `prefers-reduced-motion: reduce` → `auto`). Ne pas piéger le focus.
  5. `mode`/`qty` : présélection best-effort (mode transmis au form de commande si simple ; sinon ignoré v1).
- Robuste **sans pixel** : `track` est un no-op sûr si pas de pixel (`window.appPixel?.track`).

## Part C — Pixel Meta par resto + 3 événements

**Files :** `apps/web/src/components/lp/MetaPixel.tsx` (client, injecté dans le layout LP avec
`pixelId={lp.metaPixelId}`), un helper `apps/web/src/lib/lp/pixel.ts` (`track()` wrapper). Modifier
`getLpData`/`LpData` pour exposer `metaPixelId`.

- `MetaPixel` : si `pixelId` vide → **rien** (et `window.appPixel = { track: noop }`). Sinon injecte le
  snippet Meta officiel (`fbq('init', pixelId)`, `fbq('track','PageView')`) + expose
  `window.appPixel = { track: (ev, d) => { try { fbq('track', ev, d) } catch {} } }`. Chargé AVANT le JS
  panier (dans le layout, en tête).
- Événements (`content_ids` = ids catalogue via `toCatalogId`) :
  - **ViewContent** : au montage de la page carte `/r/[slug]` (les plats visibles). `content_type:'product'`,
    `content_ids` des plats de la carte, `currency:'XAF'`.
  - **AddToCart** : dans `AddToCartButton` (clic « + ») ET dans `DeepLinkAdd` (auto-ajout). Un seul par ajout.
  - **Purchase** : sur `/r/[slug]/merci` avec la **vraie valeur** de la commande (montant réel) + `currency`.
- Pas de secret exposé (pixel id public). Aucune donnée perso dans les événements (ids + montants seulement).

## Part D — Flux catalogue Meta (DPA)

**Files :** `apps/web/src/app/r/[slug]/catalog.csv/route.ts` (Route Handler `GET`, public, dynamique).

- Charge le menu du resto (via une lecture serveur ; RLS-safe : lecture publique des plats disponibles,
  comme la LP). Génère un **CSV compatible Meta** (en-têtes officiels) :
  `id, title, description, availability, condition, price, link, image_link, brand`.
  - `id` = `toCatalogId(menu_item.id)` ; `availability` = `in stock`/`out of stock` selon `available` ;
    `condition` = `new` ; `price` = `"<montant> XAF"` (FCFA = code ISO **XAF**) ; `link` = `orderUrl(...)` ;
    `image_link` = `photo_url` (absolu) ; `brand` = nom du resto.
  - Échappement CSV (guillemets/virgules). `Content-Type: text/csv`. `Cache-Control` court (prix frais).
  - Ne fige **jamais** un prix dans l'URL — le prix vient du menu à la génération.
- Franck colle `https://<lp>/r/<slug>/catalog.csv` comme **source de flux** dans son catalogue Meta (via le
  MCP Meta Ads ou le Business Manager). Hors périmètre code : la config côté compte Meta.

## Part E — Réglage Meta Pixel ID

**Files :** `apps/web/src/app/app/reglages/*` (nouveau champ dans la fiche pratique OU un mini-onglet
« Publicité ») + action `updateMetaPixelId`. Éventuellement aussi le champ dans `admin/restaurants/[id]`.

- Champ texte « Meta Pixel ID » (validation : chiffres, 6+), stocké sur `restaurants.meta_pixel_id`.
  Aide : « Collez l'ID de votre pixel Meta pour tracer les vues/ajouts/achats de votre carte en ligne. »

## Part F — Bot (léger)

- Le lien « commander en ligne » que le bot pourrait envoyer utilise la **même** `orderUrl`. v1 : fournir la
  fabrique et l'utiliser dans le flux catalogue ; l'intégration active dans le bot (ex. bouton « Commander en
  ligne ») est **optionnelle** et peut suivre — ne pas coder un 2e format de lien.

## Sécurité / robustesse / contraintes

- Deep-link n'accepte que des **ids connus** (ignore le reste) → pas d'injection ; plafond de lignes.
- Idempotence par nettoyage de `?add` (panier persistant → pas d'empilement au reload).
- Pixel id **public** assumé ; aucun secret client ; `track` no-op sans pixel → deep-link marche sans tracking.
- Flux catalogue : lecture seule, plats **disponibles** uniquement, aucune donnée perso.
- `content_ids` cohérents pixel ↔ flux (via `toCatalogId`) — condition du retargeting.
- A11y : scroll respecte `prefers-reduced-motion` ; pas de piège de focus.
- FR partout ; `@goutatou/db/types` côté client ; `next build` avant deploy.

## Tests

- Purs : `toCatalogId` (identité), `orderUrl` (1/n ids, options, encodage), `parseAddParam` (ids inconnus
  ignorés, dédup, plafond, vide), échappement CSV du flux (helper pur `toCsvRow`).
- Pages/route : non testées unitairement → build + typecheck + smoke.

## Hors périmètre (v1)

- Config du catalogue Meta côté Business Manager (Franck la fait, éventuellement via le MCP Meta Ads).
- Intégration active du deep-link dans le flux bot (fabrique fournie, branchement ultérieur).
- Variantes/mode complexes dans le deep-link (mode simple best-effort seulement).

## Déploiement

Migration 0034 via MCP + `notify pgrst`. Web (Netlify). Smoke : `/r/chez-demo?add=<id>` → 1 ligne au panier
+ scroll Commander ; `/r/chez-demo/catalog.csv` → CSV valide, `link` = deep-link, prix XAF ; poser un pixel
id de test → événements qui partent (Meta Pixel Helper) ; achat → Purchase.
