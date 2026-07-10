# Design v2 « Fresh food » (façon Eggify) — Design

Date : 2026-07-10
Statut : validé (brainstorming — captures Eggify fournies par Franck, palette et dark mode actés)

## Problème / intention

La v1 « chaleureux food » (terracotta, light) a posé le socle (Tailwind 4, shadcn Radix,
tokens, AppShell) mais Franck veut l'agencement et l'ambiance des mockups **Eggify** :
sidebar iconée arrondie, header avec recherche centrale + toggle jour/nuit + notifications,
hero card en dégradé, cartes pastel, rail droit (checklist + promo), et surtout **une vraie
page d'accueil dashboard** avec les chiffres du jour. Le moteur ui-ux-pro-max recommande
pour un SaaS resto : vert émeraude + ambre food, flat, densité dashboard — convergent avec
les captures.

## Décisions actées (Franck)

- **Palette** : vert émeraude (`#059669` primaire), canvas menthe `#ECFDF5`, accent ambre
  food `#D97706`, teintes pastel (rose/pêche/ciel/menthe) pour cartes KPI. Remplace le terracotta.
- **Dark mode** : OUI — light + dark + toggle header (fidèle aux captures ; dark = fond
  vert-charbon, surfaces vert sombre, émeraude vif).
- Typographie conservée : Fraunces (display) + Plus Jakarta Sans (sans).
- Périmètre : tout le produit (`/app` + nouvelle page Accueil, `/admin`, `/login`, `/roue`).
  **LP `/r/[slug]` intouchées** (couleurs par resto via lp_config).

## Architecture

### 1. Tokens v2 (globals.css)

- `:root` (light) : `--background` menthe oklch(≈0.976 0.021 166), `--card` blanc,
  `--primary` émeraude oklch(≈0.60 0.13 163), `--primary-foreground` blanc,
  `--accent` menthe teintée, `--warning` ambre food oklch(≈0.67 0.15 65),
  `--success` = primaire (vert), `--destructive` rouge, `--radius: 1rem` (plus rond qu'en v1).
- `.dark` : `--background` vert-charbon oklch(≈0.18 0.02 170), `--card` oklch(≈0.23 0.025 168),
  `--primary` émeraude vif oklch(≈0.72 0.14 163), textes clairs, bordures vert sombre —
  contrastes AA vérifiés (4.5:1 corps de texte).
- Teintes pastel KPI exposées en tokens : `--tint-rose`, `--tint-peach`, `--tint-sky`,
  `--tint-mint` (+ variantes dark assombries) → utilities via `@theme inline`.
- Le mapping badge sémantique existant (`status-badge.ts`) est conservé tel quel :
  default→primaire (émeraude), warning→ambre, success→vert, muted, destructive.

### 2. Thème + toggle

- `next-themes` réintroduit : `ThemeProvider` (attribute="class", defaultTheme="light",
  enableSystem) dans le root layout + `suppressHydrationWarning` sur `<html>`.
- Composant `ThemeToggle` (client) dans le header : soleil/lune lucide, light↔dark.
- Les LP `/r/[slug]` ne consomment pas les tokens dark (elles fixent leurs couleurs via
  lp_config) — vérification de non-régression au déploiement.

### 3. Shell v2 (AppShell)

- **Sidebar** (desktop) : logo rond Goutatou en haut, nav verticale **icône + libellé**
  (Accueil, Commandes, Menu, Campagnes, Fidélité, Statuts), état actif = fond accent +
  texte primaire ; en bas : badge du plan (conservé) + Déconnexion.
- **Header** : nom « Goutatou » en Fraunces, **recherche pill centrale** (soumet vers
  `/app/commandes?q=<terme>` ; le board lit `q` initial depuis searchParams),
  `ThemeToggle`, **cloche notifications** (client : compteur realtime des commandes
  `recue` non vues depuis l'ouverture, clic → /app/commandes), avatar (email + menu Déconnexion).
- **Cadre** : app dans un conteneur arrondi flottant sur canvas menthe (desktop ≥ md),
  pleine largeur en mobile ; topbar mobile conservée (nav horizontale scrollable).
- `/admin` : même shell, variante (nav Restaurants).

### 4. Nouvelle page Accueil `/app` (le dashboard)

Server component (`force-dynamic`), requêtes lecture seule :
- **Hero card** dégradé émeraude : « Bonjour {resto} 👋 », CA du jour + commandes actives
  en chiffres Fraunces, CTA « Voir les commandes ».
- **4 cartes KPI pastel** : CA du jour (menthe), commandes en cours (pêche), prêtes (ciel),
  panier moyen du jour (rose). Données : orders du jour (timezone resto), hors annulées.
- **Dernières commandes** : 5 dernières (composant compact réutilisant le style bandes),
  lien « Tout voir ».
- **Rail droit** : carte **« À faire »** checklist actionnable dérivée de l'état réel —
  canal WhatsApp non connecté (whapi_channels absent/status≠active), LP non publiée
  (lp_config.published falsy), roue désactivée (wheel_enabled false), plan starter
  (upsell) — chaque item avec lien vers l'écran concerné ; + carte astuce/promo
  (statique, dismissible non requis).
- Realtime : refresh sur changements orders (même pattern que le board).
- La nav « Accueil » pointe sur `/app` ; les redirects existants (login → /app/commandes)
  passent sur `/app`.

### 5. Écrans existants

Re-skin tokens v2 + vérification dark, structures conservées : commandes (table RushHour
telle quelle), menu, campagnes, statuts, fidélité, admin, login, roue. Aucun changement
de server action, requête (hors lectures KPIs), realtime, gating, textes FR.

## Hors scope (YAGNI)

- Thème par restaurant, page de recherche globale dédiée, notifications persistées en base,
  centre de notifications, refactor LP, charts (viendront avec le lot KPIs avancés),
  composants 21st.dev (MCP indisponible cette session — enrichissement ultérieur).

## Vérification

- `typecheck + test + build` par tâche ; suite existante verte.
- Contrôle visuel light **et dark** par écran (preview locale, page mock temporaire si
  besoin — serveur preview arrêté avant tout `next build`).
- Contrastes AA sur les nouveaux tokens (spot-check).
- Revue finale de branche (opus) avant merge ; Netlify au merge ; bot non concerné.
