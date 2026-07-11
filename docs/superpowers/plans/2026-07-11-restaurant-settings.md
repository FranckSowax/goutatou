# Paramétrage restaurants & bot (étape 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Fiche restaurant + messages bot paramétrables, commande « infos », /admin restructuré (Dashboard/Restaurants/fiche à onglets), /app/reglages. Spec : `docs/superpowers/specs/2026-07-11-restaurant-settings-design.md` (CONTRATS EXACTS — la lire en entier).

## Global Constraints

- Migration 0018 = 6 colonnes nullables sur restaurants (SQL exact dans la spec). Null = comportement actuel.
- Machine bot PURE, style/tests existants ; `infos` = commande globale comme `panier` (ne perd jamais l'état ni le panier, silencieuse en HUMAIN).
- Écritures restaurants : client admin APRÈS garde (is_platform_admin côté /admin, membre côté /app/reglages — pattern 3A). Messages FR fixes dans les catch client (redaction prod). JAMAIS de fonction RSC→client (ReactNode pré-rendus si besoin).
- Éditeur LP /admin/lp INTOUCHÉ. Gates par paquet (web 115+, bot 127+, db). Branche `feature/restaurant-settings`.

---

### Task S1: Migration 0018 + types partagés

**Files:** Create `supabase/migrations/20260711000018_restaurant_profile.sql` ; Modify `packages/db/src/types.ts` (type RestaurantProfile + champs)

- SQL exact de la spec. `supabase db reset` local (0001→0018) + suites pgTAP 01-08 toujours vertes (aucun nouveau test requis — colonnes nullables pures).
- Types : `RestaurantProfile { address, contactPhone, hoursText, deliveryInfo, botWelcome, botInfoExtra }` (string | null partout).
- [ ] Gate db typecheck + reset + suites. Commit `feat(db): fiche restaurant + messages bot (migration 0018)`.

---

### Task S2: Bot — commande infos + accueil personnalisé (TDD)

**Files:** Modify `services/whatsapp/src/bot/{machine.ts,copy.ts}`, `services/whatsapp/src/{repo.ts,processor.ts}` ; Test `services/whatsapp/test/machine-infos.test.ts`

- Repo : loadMenu (ou équivalent contexte) charge aussi la fiche → `ctx.profile` (champs null omis). Processor : injection, rien d'autre.
- Machine : commande globale `infos` (avant le switch, comme `panier` ; HUMAIN reste silencieux) → copy.infos(profile) ; welcome : copy.welcome(name, botWelcome?) — si perso, l'utiliser + rappel « menu / infos / panier ».
- copy.infos : bloc FR champs remplis seulement (📍 adresse, 🕒 horaires, 🛵 livraison, 📞 téléphone, ℹ️ extra) ; fiche vide → message générique FR.
- TDD 6 cas de la spec (dont non-régression welcome défaut : scénario existant rejoué identique).
- [ ] Gate bot (127+N). Commit `feat(bot): commande infos + accueil personnalisé par restaurant`.

---

### Task S3: /admin restructuré — nav + fiche restaurant à onglets

**Files:** Modify `apps/web/src/app/admin/{layout.tsx,page.tsx,actions.ts}` ; Create `apps/web/src/app/admin/restaurants/page.tsx`, `apps/web/src/app/admin/restaurants/[id]/page.tsx` (+ composants onglets client)

- LIRE admin/page.tsx + actions.ts + layout d'abord (garde is_platform_admin, client admin, nav actuelle).
- /admin = Dashboard seul (KPIs existants déplacés tels quels) ; /admin/restaurants = table + onboarding existants (lignes cliquables → fiche) ; nav latérale admin : Dashboard, Restaurants (pattern nav-links /app si réutilisable).
- Fiche [id] : Tabs shadcn (Général / Bot WhatsApp / Site / Fidélité / Danger) — contenus exacts dans la spec. Actions : updateRestaurantProfile(id, formData), updateBotMessages(id, formData), setPlan si pas déjà là, deleteRestaurant (dialog destructive) — client admin après garde. Aperçu bot = rendu du bloc infos côté client (dupliquer le format copy.infos en TS web léger, pas d'import du bot).
- [ ] Gate web complet. Commit `feat(web): admin restructuré — dashboard, restaurants, fiche à onglets`.

---

### Task S4: /app/reglages restaurateur

**Files:** Create `apps/web/src/app/app/reglages/page.tsx` (+ form client) + actions ; Modify `apps/web/src/components/nav-links.tsx` + `apps/web/src/app/app/layout.tsx` (entrée « Réglages », icône Settings, dernière position)

- Page : sections Fiche pratique + Messages du bot (mêmes champs/labels que l'onglet admin, PAS de canal/plan/danger). Action updateMyRestaurantProfile : garde membre puis client admin (pattern 3A/fidelite settings).
- [ ] Gate web complet. Commit `feat(web): réglages restaurant côté dashboard (/app/reglages)`.

---

### Task S5: Revue finale + prod + smoke

- [ ] review-package base..HEAD → revue opus (gardes admin/membre sur CHAQUE action, deleteRestaurant, non-régression bot, cohérence aperçu vs copy.infos). Fix wave unique.
- [ ] Migration 0018 prod + notify pgrst. Merge ff main + push (Netlify) + railway up. Smoke : fiche Chez Demo remplie via /admin (ou SQL), visible /app/reglages ; ledger + mémoire.
