# Refonte design UI « Chaleureux food » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'UI produit (dashboard `/app`, `/admin`, `/login`, `/roue`) en identité « chaleureux food » (terracotta/crème/olive, light seul) sur Tailwind 4 + shadcn/ui (Radix).

**Architecture:** Une tâche d'upgrade Tailwind 4, une tâche socle (shadcn init + tokens CSS + polices), un shell applicatif partagé, puis un restyling écran par écran qui ne touche QUE le rendu (aucune server action, requête, route ni logique realtime modifiée). Contrôles visuels en preview locale par le contrôleur entre les tâches.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4 (CSS-first), shadcn/ui (variante Radix, code copié), lucide-react, next/font (Fraunces + Plus Jakarta Sans).

## Global Constraints

- Identité : light UNIQUEMENT (pas de dark mode, pas de `dark:` variants).
- shadcn variante **Radix** épinglée — aucun import Base UI (`@base-ui/*` interdit).
- Aucune modification de : server actions, requêtes Supabase, routes, gating (assertPlan/isPro), logique realtime, textes FR fonctionnels.
- LP `/r/[slug]` : aucun changement volontaire de code.
- Composants shadcn autorisés (YAGNI, rien d'autre) : button, card, badge, input, label, select, textarea, dialog, tabs, table, sonner.
- Nouvelles deps npm autorisées : `lucide-react` + deps Radix installées par la CLI shadcn + `tailwindcss@4`/`@tailwindcss/postcss`. Rien d'autre.
- États métier → tokens sémantiques (jamais de couleur ad hoc) :
  - OrderStatus `'recue'`→primary, `'en_preparation'`→warning, `'prete'`→success, `'recuperee'`→muted, `'annulee'`→destructive.
  - CampaignStatus `'draft'`→muted, `'scheduled'`→warning, `'sending'`→primary, `'sent'`→success, `'canceled'`→destructive.
  - StatusState `'draft'`→muted, `'scheduled'`→warning, `'posting'`→primary, `'posted'`→success, `'failed'`→destructive, `'canceled'`→muted.
- Vérif par tâche : `pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build` — suite verte, build OK.
- Monorepo pnpm : exécuter les commandes depuis la racine `/Users/sowax/Desktop/Goutatou`.

---

### Task 1: Upgrade Tailwind 3.4 → 4

**Files:**
- Modify: `apps/web/package.json`, `apps/web/postcss.config.mjs`, `apps/web/src/app/globals.css`
- Delete (probable, décidé par l'outil d'upgrade): `apps/web/tailwind.config.ts`

**Interfaces:**
- Consumes: rien.
- Produces: Tailwind 4 fonctionnel en config CSS-first (`@import "tailwindcss"` dans globals.css) ; toutes les pages existantes rendent comme avant.

- [ ] **Step 1: Lancer l'outil d'upgrade officiel**

```bash
cd /Users/sowax/Desktop/Goutatou/apps/web
npx @tailwindcss/upgrade
```
L'outil migre `globals.css` (`@tailwind base/components/utilities` → `@import "tailwindcss"`), met à jour `package.json` (tailwindcss@4 + `@tailwindcss/postcss`), adapte `postcss.config.mjs` (`{ plugins: { '@tailwindcss/postcss': {} } }`) et supprime/réduit `tailwind.config.ts` (contenu actuel trivial : `content` seulement — plus nécessaire en v4).

- [ ] **Step 2: Installer et builder**

```bash
cd /Users/sowax/Desktop/Goutatou && pnpm install
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
```
Expected: 35 tests verts, build OK, toutes les routes présentes.

- [ ] **Step 3: Vérification visuelle de non-régression (contrôleur)**

Le contrôleur (pas l'implémenteur) vérifie en preview locale après le commit : `/login`, `/app/commandes`, `/app/menu`, `/roue`, et surtout une LP `/r/<slug>` (grain/vignette/animations GSAP intacts). Toute dérive visuelle = fix avant de continuer.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "chore(web): upgrade Tailwind CSS 4 (config CSS-first)"
```

---

### Task 2: Socle design — shadcn init (Radix) + tokens + polices + composants

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/package.json`, `apps/web/components.json` (créé par la CLI)
- Create: `apps/web/src/components/ui/{button,card,badge,input,label,select,textarea,dialog,tabs,table,sonner}.tsx`, `apps/web/src/lib/utils.ts` (cn), `apps/web/src/lib/status-badge.ts`
- Test: `apps/web/test/status-badge.test.ts`

**Interfaces:**
- Consumes: Tailwind 4 (Task 1).
- Produces:
  - Tokens CSS light (`--background`, `--primary`, `--success`, `--warning`, …) + utilities `font-display`/`font-sans`.
  - Composants shadcn dans `@/components/ui/*` (Badge avec variants `success`/`warning` ajoutés).
  - `badgeVariantForOrder(s: OrderStatus)`, `badgeVariantForCampaign(s: CampaignStatus)`, `badgeVariantForStatus(s: StatusState)` → `'default'|'secondary'|'destructive'|'outline'|'success'|'warning'|'muted'` dans `@/lib/status-badge`.

- [ ] **Step 1: Init shadcn (variante Radix)**

```bash
cd /Users/sowax/Desktop/Goutatou/apps/web
pnpm dlx shadcn@latest init
# Choix : style par défaut, base color neutral, CSS variables OUI, variante RADIX (pas Base UI)
pnpm dlx shadcn@latest add button card badge input label select textarea dialog tabs table sonner
```
Ajouter en tête de `src/components/ui/button.tsx` (convention d'équipe) :
```tsx
// Convention Goutatou : composants shadcn variante RADIX uniquement (pas de @base-ui/*).
```

- [ ] **Step 2: Poser les tokens « chaleureux food » (light seul)**

Remplacer le bloc `:root` généré dans `globals.css` par :

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-fraunces), Georgia, serif;
}

:root {
  /* Chaleureux food — light uniquement */
  --background: oklch(0.977 0.008 84);        /* crème #FAF7F2 */
  --foreground: oklch(0.28 0.025 50);         /* brun foncé chaud */
  --card: oklch(0.995 0.004 84);
  --card-foreground: oklch(0.28 0.025 50);
  --popover: oklch(0.995 0.004 84);
  --popover-foreground: oklch(0.28 0.025 50);
  --primary: oklch(0.58 0.155 42);            /* terracotta ~#C2410C */
  --primary-foreground: oklch(0.985 0.005 84);
  --secondary: oklch(0.93 0.025 100);         /* olive doux (surface) */
  --secondary-foreground: oklch(0.35 0.05 120);
  --muted: oklch(0.945 0.01 84);
  --muted-foreground: oklch(0.50 0.02 60);
  --accent: oklch(0.94 0.03 55);              /* teinte terracotta claire */
  --accent-foreground: oklch(0.40 0.10 42);
  --destructive: oklch(0.55 0.19 27);         /* rouge doux */
  --destructive-foreground: oklch(0.985 0.005 84);
  --success: oklch(0.55 0.11 140);            /* vert olive */
  --success-foreground: oklch(0.985 0.005 84);
  --warning: oklch(0.76 0.14 78);             /* ambre safran */
  --warning-foreground: oklch(0.32 0.06 70);
  --border: oklch(0.90 0.012 80);
  --input: oklch(0.90 0.012 80);
  --ring: oklch(0.58 0.155 42);
  --radius: 0.75rem;
}
```
Supprimer tout bloc `.dark { … }` généré (light seul).

- [ ] **Step 3: Polices next/font**

Dans `apps/web/src/app/layout.tsx` :
```tsx
import './globals.css'
import type { ReactNode } from 'react'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })

export const metadata = { title: 'Goutatou' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${fraunces.variable} ${jakarta.variable} min-h-screen bg-background font-sans text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Étendre Badge (variants success/warning/muted)**

Dans `src/components/ui/badge.tsx`, ajouter aux `variants` de `badgeVariants` :
```tsx
success: 'border-transparent bg-success text-success-foreground',
warning: 'border-transparent bg-warning text-warning-foreground',
muted: 'border-transparent bg-muted text-muted-foreground',
```

- [ ] **Step 5: Test + helper mapping badges**

Create `apps/web/test/status-badge.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { badgeVariantForOrder, badgeVariantForCampaign, badgeVariantForStatus } from '../src/lib/status-badge'

describe('status-badge mapping', () => {
  it('commandes', () => {
    expect(badgeVariantForOrder('recue')).toBe('default')
    expect(badgeVariantForOrder('en_preparation')).toBe('warning')
    expect(badgeVariantForOrder('prete')).toBe('success')
    expect(badgeVariantForOrder('recuperee')).toBe('muted')
    expect(badgeVariantForOrder('annulee')).toBe('destructive')
  })
  it('campagnes', () => {
    expect(badgeVariantForCampaign('sent')).toBe('success')
    expect(badgeVariantForCampaign('scheduled')).toBe('warning')
    expect(badgeVariantForCampaign('canceled')).toBe('destructive')
  })
  it('statuts', () => {
    expect(badgeVariantForStatus('posted')).toBe('success')
    expect(badgeVariantForStatus('failed')).toBe('destructive')
  })
})
```
Run (fail attendu), puis create `apps/web/src/lib/status-badge.ts` :
```ts
import type { OrderStatus, CampaignStatus, StatusState } from '@goutatou/db/types'

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'muted'

export function badgeVariantForOrder(s: OrderStatus): BadgeTone {
  return ({ recue: 'default', en_preparation: 'warning', prete: 'success', recuperee: 'muted', annulee: 'destructive' } as const)[s]
}
export function badgeVariantForCampaign(s: CampaignStatus): BadgeTone {
  return ({ draft: 'muted', scheduled: 'warning', sending: 'default', sent: 'success', canceled: 'destructive' } as const)[s]
}
export function badgeVariantForStatus(s: StatusState): BadgeTone {
  return ({ draft: 'muted', scheduled: 'warning', posting: 'default', posted: 'success', failed: 'destructive', canceled: 'muted' } as const)[s]
}
```
Run: tests verts.

- [ ] **Step 6: Vérif complète + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): socle design — shadcn (Radix), tokens chaleureux food, polices Fraunces/Jakarta"
```

---

### Task 3: AppShell — sidebar desktop + topbar mobile, câblé sur /app et /admin

**Files:**
- Create: `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/nav-links.tsx`
- Modify: `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: tokens + `cn` (Task 2).
- Produces: `<AppShell items={NavItem[]} title footer>` où `type NavItem = { href: string; label: string; icon: keyof typeof import('lucide-react') }` — utilisé par les deux layouts. `NavLinks` (client) gère l'état actif via `usePathname`.

- [ ] **Step 1: Créer NavLinks (client, état actif)**

`apps/web/src/components/nav-links.tsx` :
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, type LucideIcon } from 'lucide-react'

const ICONS = { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate } satisfies Record<string, LucideIcon>
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()
  return (
    <nav className={cn('gap-1', orientation === 'vertical' ? 'flex flex-col' : 'flex overflow-x-auto')}>
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const active = pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}>
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Créer AppShell (server)**

`apps/web/src/components/app-shell.tsx` :
```tsx
import type { ReactNode } from 'react'
import { NavLinks, type NavItem } from '@/components/nav-links'

export function AppShell({ items, title, footer, children }: {
  items: NavItem[]; title: string; footer?: ReactNode; children: ReactNode
}) {
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-5 py-5 font-display text-xl font-semibold text-primary">{title}</div>
        <div className="flex-1 px-3"><NavLinks items={items} orientation="vertical" /></div>
        {footer ? <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground">{footer}</div> : null}
      </aside>
      {/* Topbar mobile */}
      <div className="sticky top-0 z-20 border-b border-border bg-card md:hidden">
        <div className="px-4 pt-3 font-display text-lg font-semibold text-primary">{title}</div>
        <div className="px-2 pb-2"><NavLinks items={items} orientation="horizontal" /></div>
      </div>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Câbler /app et /admin**

`apps/web/src/app/app/layout.tsx` — remplacer la nav actuelle (garde serveur inchangée) :
```tsx
const NAV = [
  { href: '/app/commandes', label: 'Commandes', icon: 'ClipboardList' },
  { href: '/app/menu', label: 'Menu', icon: 'UtensilsCrossed' },
  { href: '/app/campagnes', label: 'Campagnes', icon: 'Megaphone' },
  { href: '/app/fidelite', label: 'Fidélité', icon: 'Gift' },
  { href: '/app/statuts', label: 'Statuts', icon: 'Camera' },
] satisfies NavItem[]
// return <AppShell items={NAV} title="Goutatou">{children}</AppShell>
```
`apps/web/src/app/admin/layout.tsx` — idem (gardes inchangées) avec
`[{ href: '/admin', label: 'Restaurants', icon: 'Store' }]` et `title="Goutatou — Admin"`
(l'éditeur LP `/admin/lp/[id]` s'atteint depuis la liste des restos — pas d'entrée de nav propre ; l'icône `LayoutTemplate` reste dispo dans ICONS pour un usage in-page).

- [ ] **Step 4: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): AppShell chaleureux food (sidebar desktop, topbar mobile) sur /app et /admin"
```
Contrôle visuel (contrôleur) : desktop + 375px, /app/* et /admin.

---

### Task 4: Login + /roue

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/roue/page.tsx`

**Interfaces:**
- Consumes: Card/Input/Label/Button (Task 2).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Login**

Restyler en carte centrée : fond `bg-background`, `<Card className="w-full max-w-sm">`, logo « Goutatou » en `font-display text-3xl text-primary`, champs `Input`+`Label`, bouton `Button` pleine largeur. La server action / le handler de connexion existant est INCHANGÉ (mêmes noms de champs).

- [ ] **Step 2: /roue**

Habiller la page aux tokens : fond crème, titre `font-display`, la roue animée existante (canvas/SVG + logique de spin) conservée TELLE QUELLE, carte résultat en `Card` avec code gagné en `font-display text-2xl text-primary`. Aucun changement à `wheel.tsx` au-delà des classes de conteneur si nécessaire.

- [ ] **Step 3: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): login + /roue aux couleurs chaleureux food"
```

---

### Task 5: Kanban commandes

**Files:**
- Modify: `apps/web/src/app/app/commandes/board.tsx`, `apps/web/src/app/app/commandes/page.tsx`

**Interfaces:**
- Consumes: Card/Badge + `badgeVariantForOrder` (Task 2).
- Produces: rien.

- [ ] **Step 1: Restyler le board**

Contraintes STRICTES : la logique realtime (canal Supabase), le fetch, les mutations de statut et la structure des données sont INCHANGÉS. Seul le JSX/classes change.
- Titre page : `font-display text-2xl font-semibold`.
- Colonnes : conteneur `rounded-xl bg-muted/50 p-3`, entête de colonne = label d'état + `Badge variant={badgeVariantForOrder(status)}` + compteur.
- Carte commande : `<Card className="p-3">` — n° commande `font-display text-lg font-semibold`, nom client `text-sm text-muted-foreground`, total FCFA `text-base font-bold text-primary`, badge mode (livraison/drive/sur place) en `Badge variant="secondary"`.
- Boutons d'avancement de statut : `Button size="sm"` (primaire pour l'action principale, `variant="outline"` pour annuler).

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): kanban commandes restylé (colonnes sémantiques, cartes food)"
```
Contrôle visuel (contrôleur) : desktop + mobile, avec commandes de test si dispo.

---

### Task 6: Menu

**Files:**
- Modify: `apps/web/src/app/app/menu/page.tsx` (+ composants colocalisés du CRUD menu s'il y en a — les repérer via les imports de la page)

**Interfaces:**
- Consumes: Card/Badge/Input/Label/Textarea/Button/Dialog (Task 2).
- Produces: rien.

- [ ] **Step 1: Restyler le CRUD menu**

Server actions inchangées (mêmes noms de champs de formulaire).
- Grille de plats : `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, chaque plat en `Card` — photo en haut (`aspect-video rounded-t-xl object-cover`), nom `font-display font-semibold`, prix FCFA `font-bold text-primary`, dispo en `Badge variant={available ? 'success' : 'muted'}`.
- Formulaire ajout/édition : composants shadcn (`Input`, `Textarea`, `Label`, `Button`).
- Suppression : bouton `variant="destructive"` dans un `Dialog` de confirmation (title « Supprimer ce plat ? », description FR, boutons Annuler/Supprimer).

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): menu restylé (cartes plats, dialog suppression)"
```

---

### Task 7: Campagnes

**Files:**
- Modify: `apps/web/src/app/app/campagnes/{page.tsx,board.tsx}`, `apps/web/src/app/app/campagnes/nouvelle/{page.tsx,form.tsx}`, `apps/web/src/app/app/campagnes/[id]/page.tsx` (repérer les fichiers réels via `ls`)

**Interfaces:**
- Consumes: Card/Badge/Button/Input/Textarea/Tabs + `badgeVariantForCampaign` (Task 2).
- Produces: le pattern « carte upsell » réutilisé en Task 8/9.

- [ ] **Step 1: Restyler liste + composer + détail**

Realtime, actions, gating premium INCHANGÉS.
- Liste : cartes campagne (nom `font-display font-semibold`, badge `badgeVariantForCampaign(status)`, compteurs envoyés/échecs en `text-sm text-muted-foreground`), bouton « Nouvelle campagne » primaire.
- Composer : formulaire shadcn ; boutons Envoyer/Programmer/Brouillon (primaire / outline / ghost).
- Détail : entête avec badge d'état + progression, bouton Annuler `variant="destructive"` (dialog de confirmation).
- **Carte upsell premium** (pattern à produire ici, réutilisé ensuite) :
```tsx
<Card className="border-primary/30 bg-accent p-6 text-center">
  <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Premium</p>
  <p className="mt-2 text-sm text-muted-foreground">Contactez Goutatou pour activer les campagnes WhatsApp.</p>
</Card>
```
(Adapter le texte FR existant de chaque écran — ne pas le réécrire.)

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): campagnes restylées (cartes, badges d'état, upsell terracotta)"
```

---

### Task 8: Fidélité

**Files:**
- Modify: `apps/web/src/app/app/fidelite/{page.tsx,prizes.tsx}` (+ autres composants colocalisés repérés via imports)

**Interfaces:**
- Consumes: Card/Table/Badge/Input/Button/Dialog (Task 2) + pattern upsell (Task 7).
- Produces: rien.

- [ ] **Step 1: Restyler**

Actions et gating Pro INCHANGÉS.
- Lots : `Table` shadcn (colonnes Libellé / Poids / Stock, stock `-1` affiché « Illimité » via le rendu existant), actions ligne en `Button size="sm" variant="outline"`.
- Réglages roue (activation + N commandes) : `Card` dédiée avec `Input` numérique + `Button`.
- Validation code gagné : `Card` avec `Input` (code 6 caractères, `font-mono uppercase tracking-widest`) + bouton primaire ; résultat en `Badge` success/destructive.
- Upsell non-Pro : pattern Task 7 avec le texte FR existant.

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): fidélité restylée (table lots, carte réglages, validation codes)"
```

---

### Task 9: Statuts

**Files:**
- Modify: `apps/web/src/app/app/statuts/{page.tsx,board.tsx,form.tsx}`

**Interfaces:**
- Consumes: Card/Badge/Button/Input/Textarea/Select + `badgeVariantForStatus` (Task 2) + pattern upsell (Task 7).
- Produces: rien.

- [ ] **Step 1: Restyler**

Actions et gating Pro INCHANGÉS.
- Liste : cartes statut (extrait du contenu, `Badge variant={badgeVariantForStatus(state)}` avec `statusStateLabel`, date programmée en `text-sm text-muted-foreground`), bouton Annuler `variant="outline" size="sm"` sur scheduled/posting.
- Form : kind (texte/image) en `Tabs` ou boutons segmentés, upload image avec aperçu arrondi, `datetime-local` en `Input`, boutons Publier maintenant / Programmer / Brouillon (primaire / outline / ghost).
- Upsell non-Pro : pattern Task 7 avec le texte FR existant.

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): statuts restylés (cartes, badges, composer)"
```

---

### Task 10: Admin (onboarding + éditeur LP)

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx` + pages/composants sous `apps/web/src/app/admin/` (repérer via `ls` — onboarding resto, éditeur LP `/admin/lp/[id]`)

**Interfaces:**
- Consumes: tous les composants (Task 2), AppShell déjà câblé (Task 3).
- Produces: rien.

- [ ] **Step 1: Restyler**

Actions admin INCHANGÉES.
- Liste restaurants : `Table` (nom, slug, canal Whapi avec `Badge` success si `active` / warning si `qr` / destructive si `error`, plan).
- Formulaire onboarding : `Card` sectionnée (infos resto / canal Whapi / abonnement) avec composants shadcn.
- Éditeur LP : formulaires restylés (les champs et la logique de merge existants inchangés), aperçu/bouton publier en primaire.

- [ ] **Step 2: Vérif + commit**

```bash
pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web build
git add -A apps/web && git commit -m "feat(web): admin restylé (table restos, onboarding, éditeur LP)"
```

---

### Task 11: Déploiement

- [ ] **Step 1: Passe de cohérence (contrôleur)** — preview locale : chaque écran desktop + 375px, LP de contrôle, first-load JS comparé à l'avant (pas d'explosion du bundle).
- [ ] **Step 2: Revue finale de branche (opus)** puis merge :
```bash
git checkout main && git merge --ff-only feature/design-refonte && git push origin main
```
Netlify auto-deploy. Aucune migration, aucune variable d'env. Bot Railway non concerné.

---

## Notes d'exécution

- Branche : `feature/design-refonte`.
- Ordre strict T1→T3 (fondations), puis T4-T10 séquentiels (un implémenteur à la fois), T11 final.
- Les tâches de restyling (T4-T10) désignent les fichiers probables ; l'implémenteur DOIT `ls`/lire les fichiers réels de son écran et couvrir tous les composants colocalisés qu'il importe.
- Rappel constant aux implémenteurs : ne JAMAIS toucher actions/requêtes/routes/realtime/textes FR fonctionnels ; light seul ; Radix seul.
