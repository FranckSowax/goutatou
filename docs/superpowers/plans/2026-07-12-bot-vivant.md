# Bot vivant + GPS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Présence typing, accusés de lecture, réaction ✅ à la confirmation, carte GPS du resto sur « infos », position GPS client comme adresse de livraison. Spec : `docs/superpowers/specs/2026-07-12-bot-vivant-design.md` (contrats exacts).

## Global Constraints

- Machine PURE intouchée. Tous les effets « vivants » = processor, best-effort (try/catch, log, jamais bloquant).
- Endpoints Whapi vérifiés dans `.agents/skills/whapi/references/` (presence, read, reaction, location — jamais devinés en silence : confiance annoncée).
- Helper GPS pur (`parseLatLng`) partagé web (validation) — le bot reçoit des nombres déjà en base.
- Gates par paquet (whapi 16+, bot 155+, web 115+, db). Branche `feature/bot-vivant`.

---

### Task V1: packages/whapi — presence, read, react, location

**Files:** Modify `packages/whapi/src/client.ts` + tests

- `sendTyping(to)` (presence typing — endpoint exact selon doc skill/readme), `markAsRead(messageId)` (PUT/POST messages/{id}? — vérifier), `react(messageId, emoji)` (reaction endpoint), `sendLocation(to, lat, lng, name?)` (POST /messages/location — payload exact). Mock-fetch test chacun. Conventions retry/erreur existantes.
- [ ] Gate whapi + typecheck bot. Commit `feat(whapi): presence, lecture, réaction, localisation`.

---

### Task V2: Bot — effets processor + GPS entrant/sortant (TDD)

**Files:** Create `supabase/migrations/20260712000020_restaurant_gps.sql` (`alter table restaurants add column location_lat double precision, add column location_lng double precision;`) ; Modify `services/whatsapp/src/processor.ts`, `src/repo.ts` (charger lat/lng au contexte), types webhook (message location) ; tests processor étendus

- Typing avant la réponse + markAsRead sur chaque entrant traité (fire-and-forget catchés) ; react ✅ sur msg.id UNIQUEMENT quand create_order a réussi (lire où la confirmation est détectée) ; « infos » avec lat/lng → sendLocation APRÈS le bloc texte (pattern menu-photos) ; message webhook de type location → input machine `https://maps.google.com/?q={lat},{lng}` (vérifier le shape webhook dans la doc : message.location.latitude/longitude) ; autres types non-texte toujours ignorés.
- TDD : typing+read appelés, pas d'appel quand canal inactif/HUMAIN, react seulement sur confirmation réussie (pas sur échec create_order), location entrante en état adresse → commande avec lien maps, location entrante en MENU → notUnderstood, infos avec/sans coordonnées, échec whapi silencieux (réponse texte part quand même).
- [ ] `supabase db reset` + suites vertes + gate bot. Commit `feat(bot): présence, lecture, réaction ✅, carte et position GPS (migration 0020)`.

---

### Task V3: Web — champ Position GPS (admin + réglages)

**Files:** Create `apps/web/src/lib/gps.ts` (`parseLatLng(input): {lat,lng} | null` — accepte « lat, lng » avec espaces, valide bornes ; + test) ; Modify fiche admin onglet Général (`general-tab.tsx` + action updateRestaurantProfile) et `/app/reglages` (form + action)

- Champ unique « Position GPS (lat, lng) » avec aide FR « Google Maps → clic droit sur le resto → copier les coordonnées », defaultValue = `${lat}, ${lng}` si présents, vide → null/null, invalide → erreur FR fixe. Actions étendues (garde existante inchangée).
- [ ] Gate web. Commit `feat(web): position GPS du restaurant (fiche admin + réglages)`.

---

### Task V4: Revue + prod + smoke

- [ ] Revue inline contrôleur (chantier moyen ; passer en opus si un doute sécurité/regression apparaît). Scan handlers server→client (checklist). Migration 0020 prod + notify pgrst. Merge ff main + push + railway up. Smoke : coordonnées Chez Demo posées (0.4162, 9.4673 Libreville), « infos » via tests, fiche visible. Ledger + mémoire.
