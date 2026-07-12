# Catalogue WhatsApp natif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Menu Studio → catalogue WhatsApp Business (sync worker), carte catalogue en conversation, panier natif → commande. Spec : `docs/superpowers/specs/2026-07-12-catalogue-whatsapp-design.md` (contrats exacts — LIRE EN ENTIER).

## Global Constraints

- Endpoints Whapi catalogue/commande VÉRIFIÉS (doc skill, source whapi-mcp dans node_modules, readme.io) — confiance annoncée par endpoint, parsing défensif.
- Machine : UNE seule addition pure `beginCheckout(cart, ctx)` (TDD) — aucun état existant modifié.
- Sync : worker claim-first mono-réplica, throttle campagnes réutilisé, best-effort par produit, erreurs FR en base. Jamais de token côté client.
- Gates par paquet (whapi 20+, bot 165+, web 121+, db). Branche `feature/catalogue-whatsapp`.

---

### Task K1: Migration 0021 + whapi catalogue

**Files:** Create `supabase/migrations/20260712000021_catalog.sql` (SQL de la spec) ; Modify `packages/whapi/src/client.ts` + tests

- Méthodes : `createProduct({name, price, currency, retailer_id, description?, imageUrl?})`, `updateProduct(id, fields)`, `deleteProduct(id)`, `getProducts()` (liste avec id + retailer_id), `sendCatalog(to)`, `getOrderItems(orderId)` (items {retailer_id, quantity}). Payloads exacts selon doc/source générée. Mock-fetch test chacun.
- [ ] `supabase db reset` + suites vertes, gate whapi + typecheck bot/db. Commit `feat(whapi,db): méthodes catalogue WhatsApp + colonnes sync (migration 0021)`.

---

### Task K2: Bot — worker catalog-sync (TDD)

**Files:** Create `services/whatsapp/src/catalog/{repo.ts,worker.ts}` + tests ; Modify `config.ts` (+CATALOG_SYNC_POLL_MS défaut 60s), `index.ts` (câblage, log `[catalog-sync] démarré`)

- Repo : claimSyncRequests (requested_at non null AND (synced_at null OR requested_at > synced_at), canal actif, catalog_enabled) — claim par update conditionnel ; items disponibles du resto (id, name, price, description, photo_url, wa_product_id) ; setProductId(itemId, waId) ; finishSync(restaurantId, error|null).
- Worker : par resto claimé → getProducts (index par retailer_id) → create (sans wa_product_id ni présence distante) / update (changé — comparer name/price/description/image best-effort ou update systématique v1 simple) / delete (produits distants au retailer_id inconnu ou plat indisponible) ; sleep(nextSendDelayMs) entre appels ; erreurs par produit loggées `[catalog-sync]`, erreur globale → finishSync(message FR).
- TDD : create/update/delete diff, claim unique, throttle appelé, erreur produit → continue, erreur globale → catalog_sync_error, resto sans canal actif ignoré.
- [ ] Gate bot. Commit `feat(bot): worker de synchronisation du catalogue WhatsApp`.

---

### Task K3: Bot — carte catalogue + panier natif entrant (TDD)

**Files:** Modify `services/whatsapp/src/bot/machine.ts` (AJOUT pur beginCheckout), `copy.ts` (récap import panier), `processor.ts`, `repo.ts` (catalog_enabled + wa produits liés au contexte si utile) ; tests machine + processor

- beginCheckout(cart, ctx) : retourne { state: 'MODE', cart, replies: [récap panier (réutiliser copy.cartRecap), question mode (copy.chooseMode réel)] } — mêmes textes que le flux valider actuel (lire machine MENU→valider). TDD : panier 2 plats → MODE + récap identique au flux normal, modes selon ctx.
- Processor : « menu » + catalog_enabled + au moins un wa_product_id → sendCatalog après le texte, PAS de photos (sinon photos inchangées) ; message type 'order' → getOrderItems(order.id) (shape webhook vérifiée) → map retailer_id→menu_items disponibles (qty), droppés silencieux → cart non vide : beginCheckout, persister l'état conv comme une transition normale ; vide : sendText FR « Ces articles ne sont plus disponibles. ». Best-effort/try-catch, logMessage in/out cohérents.
- TDD : menu catalog on/off (photos vs carte), order entrant heureux (état MODE persisté, récap envoyé), order avec items inconnus droppés, order vide, échec getOrderItems → message FR générique sans crash.
- [ ] Gate bot complet. Commit `feat(bot): carte catalogue en conversation + panier WhatsApp natif accepté en commande`.

---

### Task K4: Web — onglet Catalogue (fiche admin)

**Files:** Create `apps/web/src/app/admin/restaurants/[id]/catalog-tab.tsx` ; Modify `[id]/page.tsx` (onglet + données), `[id]/actions.ts` (setCatalogEnabled, requestCatalogSync, checkBusinessAccount — health via whapiClientForRestaurant, retourne {isBusiness, phone} seulement)

- Contenus spec : prérequis (bouton « Vérifier le compte » → health is_business, badge canal actif, count plats avec photo), toggle catalog_enabled, bouton Synchroniser (requested_at=now, message FR « Synchronisation demandée — effective sous une minute. »), état (synced_at FR, count wa_product_id, catalog_sync_error en encart destructive).
- Gardes admin partout, token jamais côté client, catchs FR fixes, AUCUN handler depuis le Server Component (ActionsCell-lesson).
- [ ] Gate web. Commit `feat(web): onglet Catalogue — prérequis, activation, synchronisation`.

---

### Task K5: Revue finale opus + prod + smoke

- [ ] review-package → opus (sync = écritures de masse compte WhatsApp resto : idempotence/diff/delete safety ; nouveau chemin de commande panier natif : pricing serveur préservé via create_order, drop policy ; beginCheckout non-régression). Fix wave.
- [ ] Migration 0021 prod + notify pgrst. Merge ff main + push + railway up. Smoke réel : activer catalogue Chez Demo, sync (canal SPDRMN, compte business), vérifier produits, « menu » WhatsApp → carte. Ledger + mémoire.
