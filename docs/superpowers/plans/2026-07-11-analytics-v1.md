# Analytics v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page `/app/stats` (tendances, top plats, modes, heures) + section dashboard `/admin` (KPIs parc, courbe globale, activité premium), sur des primitives charts SVG serveur maison.

**Architecture:** Primitives charts pures (SVG, tokens, `<title>` natif) + agrégations pures testées (TZ Libreville) → deux pages serveur qui ne font que requêter (RLS côté resto, service role côté admin) et composer. Zéro dépendance nouvelle, zéro JS client ajouté, zéro migration.

**Tech Stack:** Next.js server components, SVG inline, Vitest, Supabase (selects fenêtrés).

## Global Constraints

- Règles dataviz de la spec (section « Règles dataviz ») — OBLIGATOIRES : mono-teinte primaire, pas de légende mono-série, labels directs sur petits jeux, texte en tokens texte, `<title>` par marque, pas de double axe, grille discrète, tabular-nums, formatFcfa, TZ Africa/Libreville partout.
- Tokens uniquement (aucune couleur brute, aucun `dark:` dans les pages), light+dark vérifiés visuellement.
- Aucune modification des actions/mutations/realtime existants ; requêtes AJOUTÉES en lecture seule uniquement. Aucune nouvelle dep npm.
- Annulées (`annulee`) exclues de CA/volumes partout (cohérent home-kpis).
- Gate par tâche : `pnpm --filter @goutatou/web typecheck && test && build` (47 tests + nouveaux). Jamais de build pendant une preview.
- Branche : `feature/analytics-v1`. FR partout.

---

### Task 1: Helpers stats purs (TDD)

**Files:** Create `apps/web/src/lib/stats.ts` ; Test `apps/web/test/stats.test.ts`

**Interfaces — Produces (exactes, consommées par T3/T4):**
```ts
export interface DayPoint { label: string; ca: number; count: number }   // label 'JJ/MM'
export function dailySeries(orders: { status: string; total: number; created_at: string }[], days: number, now: Date): DayPoint[]
export function topItems(items: { name: string; qty: number; unit_price: number }[], limit: number): { name: string; qty: number; ca: number }[]
export function modeSplit(orders: { status: string; mode: string }[]): { mode: string; label: string; count: number }[] // ordre fixe: sur_place 'Sur place', drive 'Drive', livraison 'Livraison'
export function hourHistogram(orders: { status: string; created_at: string }[]): { hour: number; count: number }[]     // 24 seaux
export function planSplit(rows: { plan: string }[]): { plan: string; count: number }[] // ordre starter, pro, premium
```
Règles : annulées exclues (dailySeries/hourHistogram/modeSplit) ; jours vides = 0 ; TZ Libreville via toLocaleDateString/‑TimeString (même technique que lib/home.ts) ; `now` injecté (déterminisme).

- [ ] **Step 1: tests d'abord** — cas : fenêtre 3 j avec jour vide au milieu ; annulée exclue ; frontière TZ (23:30Z = lendemain 00:30 Libreville, même pattern que home-kpis.test.ts) ; topItems agrège les doublons de nom et trie ; modeSplit ordre fixe même à 0 ; hourHistogram 24 seaux ; planSplit ordre fixe. Run (fail).
- [ ] **Step 2: implémenter** (pur, sans dépendance). Run (pass).
- [ ] **Step 3: commit** `feat(web): agrégations stats pures (séries jour, top plats, modes, heures, plans)`

---

### Task 2: Primitives charts SVG (TDD sur la géométrie)

**Files:** Create `apps/web/src/components/charts/{geometry.ts,AreaChart.tsx,BarChart.tsx,HBarList.tsx}` ; Test `apps/web/test/charts-geometry.test.ts`

**Interfaces — Produces:**
```ts
// geometry.ts (pur, testé)
export function scaleLinear(domainMax: number, rangeMax: number): (v: number) => number  // domainMax<=0 → () => 0
export function buildAreaPath(values: number[], w: number, h: number): { line: string; area: string } // '' si <2 points
export function sparseTicks<T>(items: T[], maxTicks: number): { item: T; index: number }[] // premier + dernier toujours inclus
// Composants (server, props sérialisables)
<AreaChart data={{label,value}[]} height? valueFormat?: (n)=>string ariaLabel/>
<BarChart  data={{label,value}[]} height? valueFormat? ariaLabel/>
<HBarList  data={{label,value,display?}[]} valueFormat? ariaLabel/>
```
Style : ligne `stroke-[--color-primary]` 2px, aire `fill-primary/15`, barres `fill-primary` `rx=4` (haut seulement — rect + clip simple accepté : rx=4 toléré bas compris, noter), grille horizontale 3 lignes `stroke-[--color-border]`, labels `fill-[--color-muted-foreground]` text-[10px], `<title>` par point/barre (`{label} · {valueFormat(value)}`), conteneur `role="img"` + `aria-label`, hauteur fixe (pas de CLS), largeur responsive via `viewBox` + `preserveAspectRatio="none"` sur les fills uniquement (labels dans un layer non déformé — si complexe : largeur fixe 640 viewBox et w-full h-auto, accepté).
États vides : composant rend un placeholder texte muted « Pas de données ».

- [ ] **Step 1: tests géométrie d'abord** (scaleLinear bornes/zéro, buildAreaPath forme `M…L…` + area fermée, sparseTicks inclut extrémités, vide/1 point). Run (fail). **Step 2: implémenter** geometry puis composants. Run (pass + build).
- [ ] **Step 3: commit** `feat(web): primitives charts SVG serveur (aire, barres, barres horizontales)`

---

### Task 3: Page /app/stats + nav

**Files:** Create `apps/web/src/app/app/stats/page.tsx` ; Modify `apps/web/src/app/app/layout.tsx` (NAV : `{ href: '/app/stats', label: 'Statistiques', icon: 'ChartColumn' }` après Commandes) + `apps/web/src/components/nav-links.tsx` (ICONS += ChartColumn)

Contenu (server, force-dynamic, createSupabaseServer/RLS, member → myRestaurant pattern des pages sœurs) :
- Requêtes : orders 30 j `(id, status, mode, total, created_at)` ; order_items 30 j via `order_items.select('name, qty, unit_price, orders!inner(status, created_at, restaurant_id)')` fenêtré et non-annulé (vérifier la syntaxe embed inner — sinon 2 requêtes et jointure JS par order_id, accepté).
- Compose : 3 stat-tiles (CA 30 j, commandes 30 j, panier moyen 30 j — dérivés de dailySeries 30) → `AreaChart` CA 14 j → `BarChart` commandes 14 j → grille 2 col : `HBarList` top 5 plats + `HBarList` modes → `BarChart` heures (7 j, labels '0h'…'23h' clairsemés).
- Titres de section `font-display`, cards `rounded-2xl shadow-xs`, états vides.

- [ ] Implémenter, gate complet, commit `feat(web): page /app/stats (tendances, top plats, modes, heures de pointe)`

---

### Task 4: Dashboard /admin (KPIs parc + courbe + activité premium)

**Files:** Modify `apps/web/src/app/admin/page.tsx` (section dashboard AVANT la table restos existante — la table et l'onboarding restent intacts)

- Requêtes (createAdminClient existant de la page) : restaurants (id, name, subscriptions(plan), whapi_channels(status)) [déjà en partie présent] ; orders 14 j global (status, total, created_at, restaurant_id) ; campaigns 30 j (restaurant_id, status, sent_count, created_at) ; statuses 30 j (restaurant_id, state, created_at).
- Compose : 5 stat-tiles (restos onboardés ; actifs = restaurant_id distincts avec ≥1 commande non annulée 7 j ; commandes aujourd'hui global ; canaux `active`/total ; mini HBarList plans via planSplit) → AreaChart commandes/jour global 14 j (dailySeries sur counts) → carte « Activité premium (30 j) » : lignes par resto {nom, campagnes envoyées (somme sent_count des campaigns status sent), statuts publiés (count state posted)}, tri usage desc, restos plan starter exclus ; état vide « Aucun resto Pro/Premium actif ».
- [ ] Implémenter, gate complet, commit `feat(web): dashboard admin plateforme (KPIs parc, courbe 14j, activité premium)`

---

### Task 5: Passe visuelle + revue finale + deploy

- [ ] Contrôleur : pages mock temporaires (stats + admin dashboard avec données factices riches, supprimées avant commit) → light + dark + 375px ; vérifier `<title>` au survol, labels non collés, anti-patterns dataviz (relire references/anti-patterns.md du skill).
- [ ] `review-package $(git merge-base main HEAD) HEAD` → revue finale opus (géométrie SVG, exclusion annulées partout, TZ, perf requêtes fenêtrées, aucun impact actions/realtime, règles dataviz).
- [ ] Fix wave unique si findings → merge ff main → push (Netlify). Bot non concerné. Ledger + mémoire.

## Notes d'exécution

Ordre 1→2 parallélisables en théorie mais séquentiel comme d'habitude (1 puis 2), puis 3, 4, 5. Un implémenteur à la fois, revue par tâche (inline contrôleur si diff trivial, subagent sinon).
