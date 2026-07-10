# Design v2 « Fresh food » (Eggify) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passer l'UI produit en identité « fresh food » émeraude façon Eggify — tokens light+dark + toggle, shell v2 (sidebar iconée, header recherche/notifications), nouvelle page Accueil dashboard, re-skin de tous les écrans.

**Architecture:** Une tâche tokens+thème (fondation), une tâche shell v2, une tâche page Accueil (seule tâche avec nouvelles requêtes — lecture seule), puis re-skin par lots des écrans existants, passe finale + revue opus. Aucun changement de server actions/mutations/realtime existants.

**Tech Stack:** Tailwind 4 (tokens CSS), shadcn Radix (composants existants), next-themes (toggle), lucide-react, Next.js 15 App Router, Supabase (lectures KPIs).

## Global Constraints

- Palette v2 : primaire émeraude, canvas menthe (light) / vert-charbon (dark) — valeurs exactes en Task 1, AUCUNE couleur ad hoc dans les pages (tokens uniquement).
- Dark mode via classe `.dark` (next-themes attribute="class") ; CHAQUE écran retouché doit être vérifié light ET dark ; contrastes corps de texte ≥ 4.5:1.
- Radix uniquement (pas de @base-ui) ; textes FR ; pas d'emoji comme icône structurelle (lucide SVG) — les emojis existants dans les DONNÉES (labels mode 🚗🛵🍽️) sont tolérés tels quels.
- Aucune modification de : server actions, mutations, requêtes existantes (la page Accueil AJOUTE des lectures), realtime existant, gating, routes existantes. LP `/r/[slug]` intouchées.
- Deps npm autorisées : `next-themes` (réintroduite). Rien d'autre.
- Vérif par tâche : `pnpm --filter @goutatou/web typecheck && test && build` (38 tests verts). JAMAIS de `next build` pendant qu'un dev server preview tourne.
- Monorepo pnpm, commandes depuis la racine. Branche : `feature/design-v2-fresh`.

---

### Task 1: Tokens v2 émeraude light+dark + next-themes + ThemeToggle

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/package.json`
- Create: `apps/web/src/components/theme-toggle.tsx`, `apps/web/src/components/theme-provider.tsx`

**Interfaces:**
- Produces: tokens light/dark v2 ; utilities `bg-tint-rose|peach|sky|mint` ; `<ThemeProvider>` (root) ; `<ThemeToggle />` (client, réutilisé Task 2).

- [ ] **Step 1: Remplacer les valeurs des tokens dans `:root` et ajouter `.dark`**

Dans `globals.css`, REMPLACER les valeurs du bloc `:root` (structure conservée, shim border-color et imports intacts) :

```css
:root {
  /* Fresh food — light */
  --background: oklch(0.976 0.021 166);        /* menthe #ECFDF5 */
  --foreground: oklch(0.24 0.03 175);          /* vert-noir profond */
  --card: oklch(0.995 0.002 166);              /* blanc */
  --card-foreground: oklch(0.24 0.03 175);
  --popover: oklch(0.995 0.002 166);
  --popover-foreground: oklch(0.24 0.03 175);
  --primary: oklch(0.60 0.13 163);             /* émeraude #059669 */
  --primary-foreground: oklch(0.985 0.005 166);
  --secondary: oklch(0.94 0.035 166);          /* menthe teintée */
  --secondary-foreground: oklch(0.35 0.06 170);
  --muted: oklch(0.955 0.015 166);
  --muted-foreground: oklch(0.51 0.025 175);
  --accent: oklch(0.94 0.035 166);
  --accent-foreground: oklch(0.38 0.09 168);
  --destructive: oklch(0.58 0.20 27);
  --destructive-foreground: oklch(0.985 0.005 166);
  --success: oklch(0.60 0.13 163);             /* = primaire */
  --success-foreground: oklch(0.985 0.005 166);
  --warning: oklch(0.67 0.15 65);              /* ambre food #D97706 */
  --warning-foreground: oklch(0.985 0.01 80);
  --border: oklch(0.912 0.02 166);
  --input: oklch(0.912 0.02 166);
  --ring: oklch(0.60 0.13 163);
  --radius: 1rem;
  /* Teintes pastel KPI */
  --tint-rose: oklch(0.955 0.025 10);
  --tint-peach: oklch(0.96 0.03 65);
  --tint-sky: oklch(0.955 0.025 240);
  --tint-mint: oklch(0.96 0.03 166);
}

.dark {
  --background: oklch(0.185 0.02 170);         /* vert-charbon */
  --foreground: oklch(0.94 0.01 166);
  --card: oklch(0.235 0.025 168);
  --card-foreground: oklch(0.94 0.01 166);
  --popover: oklch(0.235 0.025 168);
  --popover-foreground: oklch(0.94 0.01 166);
  --primary: oklch(0.72 0.14 163);             /* émeraude vif */
  --primary-foreground: oklch(0.16 0.03 170);
  --secondary: oklch(0.29 0.03 168);
  --secondary-foreground: oklch(0.90 0.02 166);
  --muted: oklch(0.27 0.025 168);
  --muted-foreground: oklch(0.68 0.02 170);
  --accent: oklch(0.30 0.04 168);
  --accent-foreground: oklch(0.88 0.05 166);
  --destructive: oklch(0.62 0.19 27);
  --destructive-foreground: oklch(0.97 0.01 27);
  --success: oklch(0.72 0.14 163);
  --success-foreground: oklch(0.16 0.03 170);
  --warning: oklch(0.75 0.14 70);
  --warning-foreground: oklch(0.20 0.05 75);
  --border: oklch(0.31 0.025 168);
  --input: oklch(0.31 0.025 168);
  --ring: oklch(0.72 0.14 163);
  --tint-rose: oklch(0.30 0.03 10);
  --tint-peach: oklch(0.30 0.035 65);
  --tint-sky: oklch(0.30 0.03 240);
  --tint-mint: oklch(0.30 0.035 166);
}
```
Ajouter dans `@theme inline` : `--color-tint-rose: var(--tint-rose);` (idem peach/sky/mint).

- [ ] **Step 2: next-themes + provider + toggle**

`pnpm --filter @goutatou/web add next-themes`.
Create `apps/web/src/components/theme-provider.tsx` :
```tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} {...props} />
}
```
Create `apps/web/src/components/theme-toggle.tsx` :
```tsx
'use client'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button variant="ghost" size="icon" aria-label="Changer de thème"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
```
Root `layout.tsx` : `<html lang="fr" suppressHydrationWarning>` et body enveloppé par `<ThemeProvider>`.

- [ ] **Step 3: Vérif + commit**

Gate complet + contrôle contrastes (spot-check oklch → le contrôleur vérifie visuellement).
Commit : `feat(web): tokens v2 fresh food émeraude light+dark, next-themes + ThemeToggle`

---

### Task 2: Shell v2 — sidebar iconée + header (recherche, toggle, cloche, avatar)

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/nav-links.tsx`, `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/components/header-search.tsx`, `apps/web/src/components/notifications-bell.tsx`

**Interfaces:**
- Consumes: ThemeToggle (Task 1), NavItem existant, badge plan footer existant (session finitions).
- Produces: `AppShell` v2 avec slot header ; `NotificationsBell` (client realtime) ; `HeaderSearch` (client, submit → `/app/commandes?q=…`). La nav /app gagne l'entrée `{ href: '/app', label: 'Accueil', icon: 'Home' }` en premier (icône Home ajoutée au record ICONS ; état actif de `/app` = pathname === '/app' EXACT pour ne pas s'allumer sur les sous-pages — adapter NavLinks : `item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)`).

- [ ] **Step 1: AppShell v2**

Structure cible (desktop) : conteneur `min-h-screen p-3 md:p-4` sur `bg-background` ; à l'intérieur un cadre `flex overflow-hidden rounded-3xl border border-border bg-card shadow-sm` ; sidebar `w-56` : logo (pastille ronde `bg-primary` + « Goutatou » Fraunces), `NavLinks` vertical (item : icône + libellé, actif `bg-accent text-primary`), footer (badge plan + Déconnexion existants) ; zone droite : header `flex h-16 items-center gap-4 border-b border-border px-6` (titre/brand mobile, `HeaderSearch` centrale `max-w-md flex-1`, `ThemeToggle`, `NotificationsBell`, avatar rond initiales) puis `main flex-1 overflow-y-auto p-4 md:p-6 bg-background/60`. Mobile (<md) : pas de cadre flottant, topbar existante conservée + header simplifié (recherche repliée en icône → route /app/commandes).

- [ ] **Step 2: HeaderSearch**

```tsx
'use client'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
export function HeaderSearch() {
  const router = useRouter()
  return (
    <form className="relative w-full max-w-md" onSubmit={(e) => {
      e.preventDefault()
      const q = new FormData(e.currentTarget).get('q')?.toString().trim() ?? ''
      router.push(q ? `/app/commandes?q=${encodeURIComponent(q)}` : '/app/commandes')
    }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input name="q" placeholder="Rechercher une commande…" className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </form>
  )
}
```
Board commandes : `page.tsx` lit `searchParams.q` et le passe en `initialQuery` à `Board` (state `q` initialisé avec).

- [ ] **Step 3: NotificationsBell**

Client : icône `Bell`, compteur local des INSERT sur `orders` (canal realtime `orders-bell`, même pattern createBrowserClient que le board), badge `bg-destructive` si count > 0, clic → `router.push('/app/commandes')` + reset compteur. Pas de persistance (spec).

- [ ] **Step 4: Vérif light+dark (contrôleur) + commit**

Commit : `feat(web): shell v2 fresh food — sidebar iconée, header recherche/thème/notifications`

---

### Task 3: Page Accueil `/app` — hero, KPIs pastel, dernières commandes, À faire

**Files:**
- Create: `apps/web/src/app/app/page.tsx`, `apps/web/src/app/app/home-cards.tsx` (si découpage utile), `apps/web/test/home-kpis.test.ts`
- Create: `apps/web/src/lib/home.ts` (helpers purs KPIs)
- Modify: `apps/web/src/app/login/actions.ts` (redirect post-login `/app/commandes` → `/app`) et `apps/web/src/app/admin/layout.tsx` (redirect non-admin idem) — UNIQUEMENT ces cibles de redirect.

**Interfaces:**
- Consumes: tokens/tints (T1), shell (T2), bandes commandes (style existant), formatFcfa, badgeVariantForOrder.
- Produces: `computeHomeKpis(orders: {status,total,created_at}[], todayIso: string): { caJour: number; enCours: number; pretes: number; panierMoyen: number }` (pur, testé — en cours = recue+en_preparation ; CA jour et panier moyen = commandes du jour hors annulées).

- [ ] **Step 1: TDD helper KPIs** — test avec fixtures (commandes du jour + veille + annulée) vérifiant les 4 chiffres, puis implémentation pure dans `src/lib/home.ts`.

- [ ] **Step 2: Page serveur**

Requêtes (createSupabaseServer, RLS) : resto du membre (nom, wheel_enabled, lp_config, subscriptions(plan), whapi_channels(status)) + orders 7 jours (id, order_number, status, total, created_at, mode, customers(name)). Layout : grille `lg:grid-cols-[1fr_20rem]` — colonne principale : hero card (`rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-8` : bonjour {nom}, CA jour + actives en `font-display text-4xl`, Button secondaire « Voir les commandes »), rangée 4 cartes KPI (`bg-tint-mint|peach|sky|rose`, valeur `font-display text-2xl font-semibold`, label muted), section « Dernières commandes » (5 bandes compactes réutilisant le pattern : n°, client, total primaire, badge état ; lien « Tout voir → /app/commandes »). Rail droit : Card « À faire » (items conditionnels avec icône lucide + lien : canal WhatsApp [status≠active → « Connecter votre WhatsApp » href /admin si platform admin sinon texte contact], LP non publiée → éditeur, roue désactivée → /app/fidelite, plan starter → carte upsell pattern existant) ; carte astuce statique en dessous. Realtime : petit client component refresh sur orders (pattern board).

- [ ] **Step 3: Redirects** — login/actions.ts et admin/layout.tsx : `/app/commandes` → `/app`. La garde middleware couvre déjà `/app` exact.

- [ ] **Step 4: Vérif light+dark + commit** — `feat(web): page Accueil dashboard (hero, KPIs pastel, dernières commandes, à faire)`

---

### Task 4: Re-skin Commandes + Menu (pass v2 + dark)

**Files:** `apps/web/src/app/app/commandes/{page,board}.tsx`, `apps/web/src/app/app/menu/page.tsx`

- [ ] Les tokens font l'essentiel ; retouches : coins `rounded-2xl` sur conteneurs, pilules filtres OK, vérifier chaque variant Badge/Button en dark (aucun `dark:` ad hoc — si un contraste échoue, corriger le TOKEN en globals.css, pas la page), photos menu ratio conservé. Board : brancher `initialQuery` (T2). Vérif light+dark + commit `feat(web): commandes + menu au thème fresh food`.

---

### Task 5: Re-skin Campagnes + Statuts (pass v2 + dark)

**Files:** `apps/web/src/app/app/campagnes/**`, `apps/web/src/app/app/statuts/**`

- [ ] Même consigne que Task 4 (tokens only, arrondis, vérif dark des badges/upsell). Commit `feat(web): campagnes + statuts au thème fresh food`.

---

### Task 6: Re-skin Fidélité + Admin (pass v2 + dark)

**Files:** `apps/web/src/app/app/fidelite/**`, `apps/web/src/app/admin/**`

- [ ] Même consigne. Table admin + éditeur LP (les CHAMPS de couleurs LP restent des inputs libres — ne pas les tokeniser). Commit `feat(web): fidélité + admin au thème fresh food`.

---

### Task 7: Login + /roue + passe de cohérence

**Files:** `apps/web/src/app/login/page.tsx`, `apps/web/src/app/roue/{page,wheel}.tsx`

- [ ] Login : carte sur canvas menthe, logo pastille + Fraunces. /roue : habillage tokens v2 (light par défaut — page publique SANS toggle ; elle rend sous ThemeProvider defaultTheme light, rien à faire de spécial). Contrôleur : passe visuelle complète light+dark desktop+375px sur tous les écrans (page mock temporaire pour /app/* si auth indisponible). Commit `feat(web): login + roue fresh food`.

---

### Task 8: Revue finale + merge + deploy

- [ ] `scripts/review-package $(git merge-base main HEAD) HEAD` → revue finale opus (cohérence inter-écrans, seams tokens/deps — attention particulière : next-themes réintroduit vs suppression par la session finitions ; contrastes dark ; aucun changement d'action/mutation ; LP intouchées).
- [ ] Fix wave unique si findings, puis `git checkout main && git merge --ff-only feature/design-v2-fresh && git push` (Netlify). Aucune migration, aucune env var.

## Notes d'exécution

- Ordre strict T1→T2→T3, puis T4-T7 séquentiels, T8 final. Un implémenteur à la fois.
- Contrôles visuels light+dark par le contrôleur entre les tâches (preview locale, .env.local présent ; arrêter la preview avant tout build).
- Rappels implémenteurs : tokens only (jamais de couleur brute ni de `dark:` ad hoc dans les pages), Radix only, FR, actions/requêtes intouchées (sauf lectures T3 et cibles de redirect T3).
