# Refonte Marketing — Plan d'implémentation

> Web uniquement, aucune migration. Spec : `docs/superpowers/specs/2026-07-17-marketing-redesign-design.md`.

**Goal :** hub d'accueil Marketing (KPIs + cartes-outils) + coquille commune + reskin cohérent des 4 outils.

**Architecture :** Next 15 App Router. Un composant `MarketingFrame` partagé (en-tête + largeur + retour),
un hub Server Component (KPIs Supabase + whapi best-effort), chaque page outil re-cadrée sur le frame.

## Global Constraints

- FR, sentence case, tokens du thème (aucune couleur en dur), pleine largeur + responsive, cibles ≥44px.
- Aucune régression fonctionnelle : le reskin ne touche QUE la présentation (pas les server actions/workers).
- Jamais de prop fonction Server→Client. Code client → `@goutatou/db/types`. `next build` avant deploy.
- Émeraude via `--primary` / `--tint-*` ; rayon `1rem` (`rounded-2xl`).

---

### Task M-T1 : Coquille commune (frame + tabs + layout)

**Files :** Create `apps/web/src/app/app/marketing/_components/marketing-frame.tsx` ; Modify
`marketing/marketing-tabs.tsx`, `marketing/layout.tsx`.

**Produces :** `MarketingFrame({ title, description?, action?, backHref?, children })` —
`backHref` défaut `/app/marketing` ; rend lien retour « ← Marketing », en-tête (`h1 font-display text-2xl` +
description), slot `action` à droite, puis `children`. Largeur `mx-auto max-w-5xl px-4 sm:px-6`.

- [ ] Écrire `MarketingFrame` (présentation pure, pas de data).
- [ ] `marketing-tabs.tsx` : pills `rounded-full`, actif `bg-primary/10 text-primary`, hover `bg-muted` ;
  scroll-x mobile ; Campagnes reste retiré.
- [ ] `layout.tsx` : largeur `max-w-5xl`, conserve `MarketingTabs`.
- [ ] Typecheck vert.

### Task M-T2 : Hub d'accueil `/app/marketing`

**Files :** rewrite `marketing/page.tsx` ; Create `marketing/hub.tsx`, `marketing/hub-data.ts`.

**Consumes :** `isPro`/`isPremium` non requis (le hub s'affiche pour tous) ; `getNewsletterSubscribers`
(`chaine/channel-data.ts`) ; token canal via `chaine/channel-token.ts`.

- [ ] `hub-data.ts` : `getMarketingKpis(supabase, restaurantId)` →
  `{ subscribers: number|null, optIns: number, statusesThisMonth: number, activePolls: number }`.
  - `optIns` = `count` `customers` `.eq('restaurant_id',id).eq('marketing_opt_in',true).eq('opted_out',false)`.
  - `statusesThisMonth` = `count` `statuses` du resto `created_at >= début du mois` (états publiés).
  - `activePolls` = `count` `polls` du resto ouverts (statut actif — vérifier la colonne d'état réelle).
  - `subscribers` = best-effort : charger token (`loadChannelToken`) → `getNewsletterSubscribers` ; `null`
    si pas de canal ou échec whapi (try/catch, jamais throw).
- [ ] `page.tsx` (Server) : garde membre ; `getMarketingKpis` ; rend `<MarketingHub kpis={…} />`. Plus de redirect.
- [ ] `hub.tsx` : en-tête + bandeau 4 tuiles KPI (chiffre `font-display`, « — » si `subscribers===null`) +
  grille 4 cartes-outils `<Link>` (icône lucide sur pastille `--tint`, titre, desc 1 ligne, badge chiffre,
  `ArrowRight`). `grid gap-4 sm:grid-cols-2`. Cibles ≥44px.
- [ ] Typecheck + `next build` (route `/app/marketing` rendue) verts.

### Task M-T3 : Reskin Statuts

**Files :** `marketing/statuts/page.tsx` (+ `auto-status-card.tsx` et sous-composants si nécessaire).

- [ ] Envelopper la page dans `MarketingFrame title="Statuts WhatsApp"` ; retirer le `<h1>` redondant ;
  largeur/wrappers via le frame ; cartes homogènes (`rounded-2xl`, espacements cohérents).
- [ ] Gate Pro → carte d'upsell homogène (style commun).
- [ ] Zéro changement fonctionnel (mêmes actions/état). Typecheck vert.

### Task M-T4 : Reskin Chaîne

**Files :** `marketing/chaine/page.tsx` (+ cards).

- [ ] `MarketingFrame title="Chaîne WhatsApp"` ; retirer `<h1>` ; état connexion / abonnés / composer /
  historique en cartes homogènes. Gate Pro → upsell homogène. Zéro régression. Typecheck vert.

### Task M-T5 : Reskin Sondages

**Files :** `marketing/sondages/page.tsx` (+ board).

- [ ] `MarketingFrame title="Sondages"` ; retirer `<h1>` ; formulaire + liste en grille de cartes
  homogènes. Gate Pro → upsell homogène. Zéro régression. Typecheck vert.

### Task M-T6 : Reskin QR opt-in

**Files :** `marketing/qr/page.tsx` (+ `qr-card.tsx`).

- [ ] `MarketingFrame title="QR opt-in"` ; retirer `<h1>` ; grille de cartes QR homogènes (garder la grille
  responsive, harmoniser le style de carte). Zéro régression. Typecheck vert.

### Task M-T7 : Revue + build + déploiement

- [ ] `pnpm --filter @goutatou/web typecheck` + `test` + `next build` verts.
- [ ] Preview : /app/marketing (hub) + chaque outil — captures.
- [ ] Revue opus (cohérence visuelle + non-régression fonctionnelle).
- [ ] Commit, merge main, push (Netlify). Smoke Franck.

## Self-review

- Couverture spec : coquille (M-T1), hub+KPIs (M-T2), reskin 4 outils (M-T3..T6). ✓
- Interfaces : `MarketingFrame` (M-T1) consommé par M-T2..T6 ; `getMarketingKpis` (M-T2) autonome. ✓
- M-T3..T6 indépendants (fichiers disjoints) → parallélisables une fois M-T1 livré. ✓
- Pas de placeholder ; aucune migration ; aucun changement fonctionnel. ✓
