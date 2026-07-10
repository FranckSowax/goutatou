# Refonte design UI — « Chaleureux food » — Design

Date : 2026-07-10
Statut : validé (brainstorming)

## Problème

L'interface produit (dashboard `/app`, back-office `/admin`, `/login`, page publique
`/roue`) est en Tailwind 3.4 brut : zéro token, zéro composant partagé, styles
utilitaires posés au fil des phases (`bg-white`, liens soulignés). Fonctionnel mais
spartiate et incohérent — pas au niveau d'un SaaS commercialisable.

Les landing pages `/r/[slug]` ont leur propre identité cinématique (GSAP/Lenis) et
sont **hors scope** (seul un contrôle de régression les concerne, cf. §Risques).

## Décisions actées (Franck)

- **Périmètre** : `/app` (commandes, menu, campagnes, fidélité, statuts), `/admin`,
  `/login`, `/roue`. LP exclues.
- **Identité** : « Chaleureux food » — palette chaude terracotta/crème/olive,
  formes rondes, typographie amicale. Pas un SaaS froid.
- **Dark mode** : NON (light uniquement ; les tokens rendent l'ajout ultérieur peu coûteux).
- **Approche technique** : upgrade **Tailwind 4** + **shadcn/ui actuel** (variante
  **Radix**, épinglée), theming par variables CSS. Retenu contre : rester en 3.4 +
  shadcn 2.3.0 legacy (docs gelées), et fait-main sans librairie (réinvention coûteuse).

Contexte recherche (2026-07) : shadcn/ui = standard de fait, code copié dans le repo
(pas de dépendance runtime de librairie), écosystème Tailwind-4-first depuis la CLI v4 ;
tweakcn pour générer le thème ; patterns de référence : Kiranism/next-shadcn-dashboard-starter.
Pièges connus : mix Base UI/Radix dans les snippets registry (épingler Radix),
`@tremor/react` npm en maintenance (ne pas en dépendre).

## Architecture

### 1. Socle (une tâche fondation, tout le reste s'appuie dessus)

- `npx @tailwindcss/upgrade` sur `apps/web` : Tailwind 3.4 → 4 (config CSS-first dans
  `globals.css`, `tailwind.config.ts` supprimé ou réduit). PostCSS ajusté.
- `shadcn init` (CLI actuelle), **variante Radix**. Convention écrite dans le code
  (commentaire en tête de `components/ui/`) : tout composant ajouté est Radix, pas Base UI.
- **Tokens** (variables CSS, format shadcn, light seul) dans `globals.css` :
  - `--background` crème `#FAF7F2` ; `--card` blanc cassé ; `--primary` terracotta
    (oklch ≈ #C2410C) ; `--secondary` olive ; sémantiques d'état : `--success` vert
    olive, `--warning` ambre safran, `--destructive` rouge doux ; `--radius: 0.75rem`.
  - Les états métier (kanban commandes, campagnes, statuts) sont mappés sur ces
    sémantiques — pas de couleurs ad hoc dans les pages.
- **Polices** via `next/font/google` (self-hostées au build, zéro requête client) :
  Fraunces (display/titres) + Plus Jakarta Sans (corps). Exposées en
  `--font-display` / `--font-sans`.
- **Dépendances ajoutées** : `lucide-react` (icônes, tree-shaken) + les deps Radix
  installées par la CLI shadcn pour les composants retenus. Aucune librairie de
  composants runtime.
- **Composants shadcn copiés** dans `apps/web/src/components/ui/` (et rien d'autre —
  YAGNI) : `button`, `card`, `badge`, `input`, `label`, `select`, `textarea`,
  `dialog`, `tabs`, `table`, `sonner`.

### 2. Shell applicatif

- **`/app`** : sidebar desktop (largeur fixe, logo Goutatou en Fraunces, nav iconée
  lucide : Commandes, Menu, Campagnes, Fidélité, Statuts ; badge du plan en pied) ;
  en mobile (< md) : topbar sticky avec nav horizontale scrollable. Un seul composant
  `AppShell` (server component ; l'état actif dérivé de l'URL).
- **`/admin`** : même `AppShell` en variante admin (entrées : Restaurants, LP).
- Le lien « Déconnexion » et l'email utilisateur restent où ils sont fonctionnellement.

### 3. Écrans

- **Commandes (kanban)** : colonnes teintées par sémantique d'état (bordure/entête),
  cartes commande : n° en gros, nom client, total FCFA mis en avant, badge mode
  (livraison/drive/sur place). La logique realtime/DnD existante est **inchangée** —
  seul le rendu est restylé.
- **Menu** : cartes plat (photo, nom, prix FCFA, dispo en `Badge`), formulaires en
  composants shadcn, dialog de confirmation pour suppression.
- **Campagnes** : liste en cartes avec badge d'état coloré (draft/scheduled/sending/
  sent/canceled → sémantiques), composer restylé, upsell premium en carte terracotta.
- **Fidélité** : CRUD lots en table shadcn, réglages roue en carte, codes à valider
  en input + bouton primaire.
- **Statuts** : board + form restylés (mêmes patterns que campagnes).
- **Login** : carte centrée, fond crème, logo Fraunces, inputs shadcn.
- **/roue** : habillage tokens (fond, typo, carte résultat) ; le canvas/animation de
  la roue existant est conservé tel quel.
- **Admin** : onboarding restaurant + éditeur LP restylés avec les mêmes composants.

### 4. Ce qui ne change pas (invariants)

- Aucune server action, requête, route, ni test métier modifié.
- Aucun changement de logique realtime (canaux Supabase) ni de gating (assertPlan/isPro).
- Textes FR existants conservés (sauf micro-copie purement cosmétique).
- LP `/r/[slug]` : aucun changement volontaire.
- Pas de dark mode ; pas de nouveau state client hors composants shadcn.

## Risques & mitigations

- **Upgrade TW4 touche les LP** (config partagée) : les LP n'utilisent que des
  utilities standard → l'outil d'upgrade les migre mécaniquement. Mitigation :
  contrôle visuel de régression des LP (et de /roue) en preview locale juste après
  la tâche socle, avant tout restyling.
- **Drift Base UI/Radix** dans le code généré par agents : variante Radix épinglée
  par convention écrite + revue de tâche.
- **Poids client** : composants interactifs shadcn = `"use client"` ciblés ;
  les pages restent server components. Vérif : build + first-load JS comparé.

## Tests & vérification

- Suite existante (35 web + autres paquets) reste verte à chaque tâche ;
  `typecheck` + `build` par tâche.
- Contrôle visuel en preview locale par écran restylé (+ mobile 375px).
- Pas de tests de pixel : les invariants testables sont fonctionnels (routes 200,
  composants rendus), le visuel se valide en preview.
- Revue finale de branche (opus) avant merge ; déploiement Netlify au merge.

## Hors scope (YAGNI)

- Dark mode, thèmes par restaurant, i18n, refactor des LP, charts/KPI (Tremor),
  notifications center, changement de nav mobile en bottom-tabs natif.
