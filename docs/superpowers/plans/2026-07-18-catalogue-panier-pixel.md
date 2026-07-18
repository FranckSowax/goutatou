# Catalogue → panier → pixel — Plan

> Spec : `docs/superpowers/specs/2026-07-18-catalogue-panier-pixel-design.md`. Web. Migration `20260718000034`.

**Goal :** deep-link `?add=` sur la LP + pixel Meta par resto (ViewContent/AddToCart/Purchase) + flux
catalogue Meta, reliés par une fabrique d'URL unique.

## Global Constraints
- FR ; `@goutatou/db/types` côté client ; `next build` avant deploy ; `aspect-4/3` si média.
- `content_ids` pixel ↔ `id` flux via `toCatalogId()` (identité). Deep-link : ids connus seulement, plafond,
  idempotence par nettoyage `?add`. Pixel id public, `track` no-op sans pixel.

### CP-T1 : Migration 0034 + LpData.metaPixelId
- [ ] `supabase/migrations/20260718000034_meta_pixel.sql` : `alter table restaurants add column if not exists meta_pixel_id text; notify pgrst`. Appliquer via MCP.
- [ ] `getLpData`/type `LpData` : exposer `metaPixelId: string | null` (select `meta_pixel_id`).

### CP-T2 : Purs — order-url, deep-link, csv (TDD)
- [ ] `lib/lp/order-url.ts` : `toCatalogId(id)`=identité ; `orderUrl(baseUrl, slug, ids[], opts?)`. Tests.
- [ ] `lib/lp/deep-link.ts` : `parseAddParam(raw, knownIds:Set, maxLines)` → ids valides dédupliqués cappés. Tests (inconnus ignorés, dédup, plafond, vide).
- [ ] `lib/lp/catalog-feed.ts` : `toCsvRow(fields[])` (échappement) + `buildCatalogCsv(rows, baseUrl, slug, brand)`. Tests échappement.

### CP-T3 : Deep-link component
- [ ] `components/lp/DeepLinkAdd.tsx` (client) : `useSearchParams` + `useRef` garde ; `parseAddParam` sur le catalogue reçu ; `addItem` par id ; `track('AddToCart', …)` ; `history.replaceState` pour retirer `?add` ; scroll vers CartBar (reduced-motion). Monté dans le layout/page LP sous `CartProvider`.
- [ ] Typecheck vert.

### CP-T4 : Pixel Meta + événements
- [ ] `lib/lp/pixel.ts` : `track(ev, data)` = `window.appPixel?.track` sûr.
- [ ] `components/lp/MetaPixel.tsx` (client) : si `pixelId` vide → `window.appPixel={track:noop}` ; sinon snippet Meta `fbq init/PageView` + `window.appPixel.track`. Monté en tête du layout LP.
- [ ] ViewContent au montage `/r/[slug]` (ids des plats) ; AddToCart dans `AddToCartButton` + `DeepLinkAdd` ; Purchase sur `/r/[slug]/merci` (vraie valeur).
- [ ] Typecheck vert.

### CP-T5 : Flux catalogue Meta
- [ ] `app/r/[slug]/catalog.csv/route.ts` : `GET` public dynamique → CSV Meta (`id,title,description,availability,condition,price,link,image_link,brand`), `link`=`orderUrl`, `price`=`"<n> XAF"`, plats disponibles. `Content-Type text/csv`, cache court.
- [ ] `next build` : route présente.

### CP-T6 : Réglage Meta Pixel ID
- [ ] Champ « Meta Pixel ID » dans Réglages (fiche pratique ou mini-onglet) + action `updateMetaPixelId` (validation chiffres 6+). Optionnel : champ admin.
- [ ] Typecheck vert.

### CP-T7 : Revue + deploy
- [ ] tests + typecheck + `next build` verts. Revue opus (sécurité deep-link, cohérence content_ids, no-op pixel).
- [ ] Migration prod (CP-T1). Merge main (Netlify). Smoke (cf. spec).

## Self-review
- Couverture : migration+data (T1), purs (T2), deep-link (T3), pixel+events (T4), flux (T5), réglage (T6). ✓
- Fabrique unique `orderUrl` consommée par flux (T5) + bot (ultérieur) ; `toCatalogId` partagé pixel↔flux. ✓
