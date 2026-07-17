# Spec — Refonte de la section Marketing (hub + reskin des 4 outils)

Date : 2026-07-17. **Web uniquement**, aucune migration (redesign UI ; lit des tables existantes).

## Intention

La section `/app/marketing` n'a pas de vraie page d'accueil (elle redirige vers Statuts), sa barre
d'onglets est basique, chaque page répète son titre en `<h1>` et les largeurs sont incohérentes
(`max-w-xl`/`2xl`/`3xl`) → « pas moderne, mal agencée ». On refait :
1. Un **hub d'accueil** `/app/marketing` : bandeau de KPIs + grille de cartes-outils (chiffres en direct
   + entrée vers chaque outil).
2. Une **coquille commune** cohérente (cadre, en-tête, largeur, retour) partagée par tous les outils.
3. Le **reskin de l'intérieur** des 4 outils (Statuts, Chaîne, Sondages, QR) sur le même système de cartes.

## Décisions produit (validées avec Franck)

- **Hub d'accueil** avec **KPIs en direct + navigation** (pas seulement des portes d'entrée).
- **Reskin complet** : coquille ET intérieur des 4 outils.
- **Onglets conservés** pour switcher entre outils (le hub est la porte d'entrée).
- Émeraude Goutatou, pleine largeur, responsive, cibles ≥44px.

## Réutilisé (rien à réinventer)

- Tokens thème (`globals.css`) : `--primary` émeraude, `--tint-*`, `--radius: 1rem`, `font-display`.
- `isPro` / `isPremium` (`lib/premium.ts`) pour le gating par outil.
- Données existantes : `statuses`, `polls`, `customers.marketing_opt_in`, abonnés chaîne via
  `getNewsletterSubscribers` (`marketing/chaine/channel-data.ts`, best-effort whapi).
- `PageTabs` / `MarketingTabs` (barre d'onglets, à moderniser mais conserver le principe).

## Part A — Coquille commune

**Files :** `apps/web/src/app/app/marketing/layout.tsx`, `marketing-tabs.tsx`, +
`apps/web/src/app/app/marketing/_components/marketing-frame.tsx` (nouveau, partagé).

- **`marketing-frame.tsx`** (Server/Client neutre) : cadre commun d'une page outil — largeur homogène
  (`mx-auto max-w-5xl px-4 sm:px-6`), en-tête standard `{ title, description?, action? }` (titre
  `font-display text-2xl`, description `text-sm text-muted-foreground`), et un lien retour discret
  « ← Marketing » vers le hub. Remplace les `<h1>` + wrappers ad hoc de chaque page.
- **`marketing-tabs.tsx`** : modernisé — pills arrondies (`rounded-full`, état actif `bg-primary/10
  text-primary`, hover doux) au lieu du `border-b` fin ; scroll horizontal conservé sur mobile ;
  Campagnes reste masqué.
- **`layout.tsx`** : largeur alignée sur le frame (`max-w-5xl`), garde `MarketingTabs`.

## Part B — Hub d'accueil `/app/marketing`

**Files :** remplace `marketing/page.tsx` (aujourd'hui un `redirect`) ; `marketing/hub.tsx` (présentation),
`marketing/hub-data.ts` (chargement KPIs).

- **`page.tsx`** (Server Component) : garde membre ; charge les KPIs via `hub-data.ts` ; rend `<MarketingHub>`.
  Ne redirige plus.
- **`hub-data.ts`** : `getMarketingKpis(supabase, restaurantId, channelToken?)` →
  `{ subscribers: number|null, optIns: number, statusesThisMonth: number, activePolls: number }`.
  - `optIns` : `count` de `customers` `marketing_opt_in = true`, `opted_out = false`, du resto.
  - `statusesThisMonth` : `count` de `statuses` du resto sur le mois courant (état publié/envoyé).
  - `activePolls` : `count` de `polls` ouverts/actifs du resto.
  - `subscribers` : `getNewsletterSubscribers` (whapi, best-effort) → `null` si canal absent/déconnecté.
- **`hub.tsx`** (présentation, données only) :
  - En-tête « Marketing » + sous-titre.
  - **Bandeau KPIs** : 4 tuiles (`--tint-*` doux ou surface muted, `font-display` pour le chiffre).
    Abonnés chaîne affiche « — » si `null`.
  - **Grille de 4 cartes-outils** (`grid` responsive 1→2 colonnes) : Statuts, Chaîne, Sondages, QR.
    Chaque carte = icône (lucide) sur pastille `--tint`, titre, description une ligne, **chiffre en direct**
    (badge), flèche ; toute la carte est un `<Link>` vers l'outil. Cibles ≥44px.
  - Icônes : Statuts `Image`, Chaîne `Megaphone`, Sondages `BarChart3`, QR `QrCode` (lucide-react).

## Part C — Reskin intérieur des 4 outils

Chaque page outil adopte `MarketingFrame` (en-tête standard, retour, largeur homogène) et un système de
cartes cohérent. **Aucun changement fonctionnel** (mêmes actions, mêmes données, mêmes gates Pro) — pure
refonte visuelle/agencement. Supprimer les `<h1>` redondants (le frame porte le titre).

- **Statuts** (`statuts/page.tsx` + `auto-status-card.tsx` + sous-composants) : frame « Statuts WhatsApp » ;
  composer + liste dans des cartes homogènes ; sous-onglets internes (pills) alignés sur le nouveau style.
- **Chaîne** (`chaine/page.tsx` + cards) : frame « Chaîne WhatsApp » ; état de connexion, abonnés,
  composer post, historique — en cartes cohérentes.
- **Sondages** (`sondages/page.tsx` + board) : frame « Sondages » ; formulaire + liste des sondages en
  grille de cartes homogènes.
- **QR opt-in** (`qr/page.tsx` + `qr-card.tsx`) : frame « QR opt-in » ; grille de cartes QR homogènes
  (garde la grille responsive existante, harmonise le style de carte).

Le gate Pro/Premium de chaque page est conservé mais présenté dans une **carte d'upsell homogène**
(même style partout, au lieu des variantes actuelles `border-primary/30 bg-accent`).

## Contraintes transverses

- FR partout, sentence case, tokens du thème (aucune couleur en dur), pleine largeur + responsive,
  cibles tactiles ≥44px. Jamais de prop fonction Server→Client.
- Pas de régression fonctionnelle : toutes les actions/États existants continuent de marcher. Le reskin
  ne touche pas la logique (server actions, workers, whapi) — seulement la présentation.
- Code client → importer `@goutatou/db/types` (jamais l'index) ; imports relatifs dans les tests. Toujours
  `next build` avant deploy (pas juste typecheck). Cf. [[goutatou-web-gotchas]].

## Tests

- Pur : `getMarketingKpis` extrait/façonne correctement (si extractible en helper pur testable ; sinon
  couvrir par build + typecheck). KPIs = counts Supabase → testés via build vert + smoke.
- Global : `pnpm --filter @goutatou/web test` + `typecheck` + `next build` verts.

## Hors périmètre

- Aucune nouvelle fonctionnalité marketing (pas de nouveau canal, pas de segmentation, pas de campagnes —
  Campagnes reste masqué en attendant SON propre redesign).
- Aucune migration BD, aucun changement bot/worker/whapi.

## Déploiement

Web uniquement. `next build` vert → merge main → Netlify. Whapi déconnecté → « abonnés chaîne » affiche
« — » sans casse. Smoke Franck : ouvrir /app/marketing → voir le hub (KPIs + 4 cartes) → entrer dans
chaque outil → cadre homogène, retour Marketing, fonctionnalités intactes.
