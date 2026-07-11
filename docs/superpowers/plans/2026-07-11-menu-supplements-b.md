# Menu Studio — Lot B (suppléments) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppléments par plat, de bout en bout : table + RLS, CRUD dans le Menu Studio, picker sur la LP, pricing serveur dans `create_order` v2, et proposition en conversation WhatsApp (état SUPPLEMENTS de la machine du bot).

**Architecture:** Deux migrations SQL (table 0014, create_order v2 0015 — rétrocompatible : items sans `supplement_ids` = comportement identique). Les suppléments d'une commande deviennent des lignes `order_items` « ↳ {nom} » insérées après leur parent (récaps/kanban/notifs les affichent naturellement). Machine bot pure étendue (état SUPPLEMENTS testé), panier bot/LP portent `supplementIds`.

**Tech Stack:** Postgres/pgTAP, Supabase RLS, Next.js (LP cart localStorage), machine à états pure du bot (vitest), MCP Supabase pour la prod.

## Global Constraints

- `create_order` v2 : **service_role only** (ACL de 0005 préservée à l'identique), pricing 100 % serveur (jamais de prix client), ids de suppléments invalides/cross-resto/cross-plat/indisponibles **silencieusement ignorés** (politique items indisponibles existante). RÉTROCOMPAT STRICTE : un appel v1 (sans supplement_ids) produit exactement le résultat d'avant (pgTAP le prouve).
- Lignes suppléments : name = `'↳ ' || s.name`, unit_price = s.price, qty = qty du parent, insérées immédiatement après la ligne parent ; total = somme serveur parent+suppléments.
- Machine bot : PURE (aucun I/O), même style/tests que les états existants (lire machine.ts + machine-*.test.ts AVANT). Un plat SANS suppléments disponibles ne change RIEN au flux actuel. `0`, `non`, `NON` terminent la sélection ; numéro invalide → re-prompt FR ; multi-sélection par messages successifs ; le récap panier liste les suppléments.
- LP : anciens paniers localStorage (sans champ supplements) restent valides (défaut []). validateWebOrder étendu : `supplementIds?: string[]` (max 10, strings non vides) par item.
- Aucune modification des écrans hors périmètre ; textes FR ; tokens ; gates par paquet (web 86+, bot 79+, pgTAP) ; jamais de build pendant une preview. Branche `feature/menu-supplements-b`.

---

### Task B1: Migration 0014 — table menu_supplements + pgTAP

**Files:** Create `supabase/migrations/20260711000014_menu_supplements.sql`, `supabase/tests/database/06_menu_supplements.test.sql`

```sql
create table menu_supplements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  available boolean not null default true,
  position integer not null default 0
);
create index menu_supplements_item_idx on menu_supplements (menu_item_id, position);
alter table menu_supplements enable row level security;
create policy tenant_all_menu_supplements on menu_supplements for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
```
pgTAP (≥5 asserts) : table/colonnes, RLS activée, policy présente, insert membre OK via is_member simulé (pattern des tests RLS existants — lire 02_rls_isolation), cascade delete du plat supprime ses suppléments.
- [ ] Écrire migration + test, `supabase db reset` local + exécuter la suite pgTAP (pattern RL-T1 : psql -f si pg_prove absent), suites 01-05 toujours vertes. Commit `feat(db): table menu_supplements + RLS (migration 0014)`.

---

### Task B2: Migration 0015 — create_order v2 (suppléments pricés serveur) + pgTAP

**Files:** Create `supabase/migrations/20260711000015_create_order_v2.sql`, `supabase/tests/database/07_create_order_v2.test.sql`

- LIRE d'abord la fonction actuelle (migrations 0003 + durcissement 0005) et la re-déclarer intégralement (`create or replace`) en préservant : signature (p_items jsonb inchangé — les entrées GAGNENT une clé optionnelle `supplement_ids`), gardes existantes (empty/no_valid_items, drive slot, indisponibles droppés), ACL service_role only (re-révoquer/re-granter comme 0005 par sûreté).
- Ajout dans la boucle items, après l'insert de la ligne parent :
```sql
if v_item ? 'supplement_ids' then
  for v_sup in
    select s.name, s.price from menu_supplements s
    where s.id = any (select jsonb_array_elements_text(v_item->'supplement_ids')::uuid)
      and s.menu_item_id = v_menu_item_id
      and s.restaurant_id = p_restaurant_id
      and s.available
  loop
    insert into order_items (order_id, restaurant_id, menu_item_id, name, unit_price, qty)
      values (v_order_id, p_restaurant_id, v_menu_item_id, '↳ ' || v_sup.name, v_sup.price, v_qty);
    v_total := v_total + v_sup.price * v_qty;
  end loop;
end if;
```
(adapter aux noms de variables réels de la fonction ; dédupliquer les ids via distinct.)
- pgTAP : v1 sans supplement_ids → résultat identique à avant (total, lignes) ; avec 2 suppléments valides → 2 lignes ↳ + total correct ; id cross-plat ignoré ; id cross-resto ignoré ; supplément indisponible ignoré ; ACL : anon/authenticated ne peuvent pas exécuter.
- [ ] Migration + tests locaux (reset + suite complète 01-07 verte). Commit `feat(db): create_order v2 — suppléments pricés serveur (migration 0015)`.

---

### Task B3: Menu Studio — CRUD suppléments dans le dialog édition

**Files:** Modify `apps/web/src/app/app/menu/actions.ts` (AJOUTS), `apps/web/src/app/app/menu/edit-item-dialog.tsx` ; requête page.tsx enrichie (`menu_supplements` par item)

- Actions (pattern du fichier) : `createSupplement(itemId, formData{name, price})`, `updateSupplement(id, formData)`, `deleteSupplement(id)`, `toggleSupplementAvailable(id, available)`.
- Dialog : section « Suppléments » sous la photo — liste (nom · prix · toggle dispo · supprimer) + mini-form ajout (Input nom + Input prix + bouton). Pas de dnd (position = ordre de création, incrément max+1).
- page.tsx : select étendu `menu_supplements(id, name, price, available, position)` ; MenuStudio affiche un petit badge « {n} suppl. » sur les lignes qui en ont.
- [ ] Gate web complet. Commit `feat(web): suppléments par plat dans le menu studio`.

---

### Task B4: LP — picker suppléments + panier + API v2

**Files:** Modify `apps/web/src/lib/lp/{data.ts, cart helpers}`, `apps/web/src/lib/lp/order-validation.ts` + son test, composants LP panier/carte (`components/lp/*` — repérer AddToCart/CartBar/checkout), `apps/web/src/app/api/lp/[slug]/order/route.ts`

- getLpData : items exposent `supplements: {id, name, price}[]` (disponibles seulement).
- Ajout au panier : si supplements.length>0 → mini-dialog checkboxes (nom + prix) + « Ajouter » ; sinon comportement actuel. Panier (localStorage) : item gagne `supplements: {id, name, price}[]` (défaut [] au parse d'anciens paniers) ; deux ajouts du même plat avec suppléments différents = lignes séparées (clé = menuItemId + ids triés). Affichage panier/checkout : sous-lignes « ↳ nom +prix ».
- validateWebOrder : `supplementIds` optionnel par item (array de strings non vides, max 10, dédupliquées) — étendre les tests existants (order-validation.test.ts).
- route.ts : transmettre supplement_ids dans p_items. AUCUN prix client envoyé.
- [ ] Gate web (tests order-validation étendus verts). Commit `feat(web): suppléments sur la LP (picker, panier, commande)`.

---

### Task B5: Bot — état SUPPLEMENTS (machine pure, TDD)

**Files:** Modify `services/whatsapp/src/state/machine.ts` (ou fichier machine réel — lire l'arbo src), types panier bot ; Test `services/whatsapp/test/machine-supplements.test.ts`

- LIRE machine.ts + tests existants d'abord (style, transitions, format des réponses numérotées).
- Le contexte machine reçoit les plats AVEC leurs suppléments disponibles (données injectées par le processor — la machine reste pure).
- Transition : ajout d'un plat avec suppléments → state SUPPLEMENTS {itemRef} ; message : « Avec supplément pour {plat} ?\n0. Non merci\n1. {nom} +{prix} F\n… » ; réponse numéro valide → ajoute au DERNIER item du panier (dédupliqué) + re-prompt « Autre supplément ? (0 pour continuer) » ; `0`/`non` → flux normal (même sortie que l'ajout d'un plat sans suppléments) ; invalide → re-prompt. Récap panier : sous-lignes ↳ avec prix, total incluant suppléments.
- TDD : plat sans suppléments = flux inchangé (test de non-régression sur un scénario existant rejoué) ; sélection simple ; multi ; doublon ignoré ; 0/non ; invalide ; récap/total.
- [ ] Gate bot. Commit `feat(bot): machine — état SUPPLEMENTS (proposition en conversation)`.

---

### Task B6: Bot — processor/repo (données + create_order v2)

**Files:** Modify `services/whatsapp/src/` repo/processor (chargement du menu avec suppléments, appel create_order avec supplement_ids) ; tests processor existants étendus

- Repo menu : joindre menu_supplements disponibles ; passage au contexte machine.
- create_order : p_items entries portent supplement_ids quand le panier en a. Confirmation texte : lignes ↳ (déjà générées par le récap machine — vérifier le message de confirmation post-commande).
- [ ] Gate bot complet (79+N). Commit `feat(bot): commandes avec suppléments (repo, processor, create_order v2)`.

---

### Task B7: Revue finale + migrations prod + deploy + smoke

- [ ] `review-package $(git merge-base main HEAD) HEAD` → revue finale opus (rétrocompat create_order PROUVÉE, ACL, machine non-régression, panier localStorage compat, aucun prix client). Fix wave unique.
- [ ] Merge ff main + push (Netlify). Migrations 0014+0015 en prod via MCP Supabase (vérifier ACL post-apply : `has_function_privilege` anon/authenticated = false). `railway up --detach --service whatsapp-bot`.
- [ ] Smoke prod SQL : créer des suppléments sur un plat Chez Demo, appeler create_order v2 en SQL (service role) avec supplement_ids → vérifier lignes ↳ + total ; supprimer la commande test. Ledger + mémoire.
