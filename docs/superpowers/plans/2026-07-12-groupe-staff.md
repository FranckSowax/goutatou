# Groupe staff WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Groupe « Cuisine {Resto} » créé depuis /app/reglages, nouvelles commandes postées dedans par le notifier. Spec : `docs/superpowers/specs/2026-07-12-groupe-staff-design.md`.

## Global Constraints

- Endpoints whapi vérifiés (source whapi-mcp), best-effort partout côté notifier, token jamais côté client. Gates (whapi 28+, bot 225+, web 121+). Branche `feature/groupe-staff`.

---

### Task G1: Migration 0023 + whapi createGroup/getGroupInvite

**Files:** Create `supabase/migrations/20260712000023_staff_group.sql` (`alter table restaurants add column staff_group_id text, add column staff_group_invite text;`) ; Modify `packages/whapi/src/client.ts` + tests

- createGroup(name) (POST /groups — participants optionnels : ne pas en passer), getGroupInvite(groupId) (GET /groups/{id}/invite — champ exact vérifié). Mock-fetch tests.
- [ ] Reset + suites vertes, gate whapi. Commit `feat(whapi,db): groupe staff — création + invitation (migration 0023)`.

---

### Task G2: Notifier — ticket commande au groupe (TDD)

**Files:** Modify `services/whatsapp/src/notifier.ts` (+ INSERT si absent) + tests notifier

- LIRE notifier.ts d'abord (abonnement realtime actuel, pattern des notifications). Sur INSERT orders : staff_group_id + canal actif → charger items (tri position) + client → sendText ticket FR (format spec). try/catch `[staff-group]`, jamais bloquant pour le reste du notifier.
- TDD : ticket formaté (avec ↳), pas de groupe → aucun envoi, canal inactif → rien, échec sendText silencieux, INSERT sans régression des notifications de statut existantes.
- [ ] Gate bot. Commit `feat(bot): ticket des nouvelles commandes dans le groupe Cuisine`.

---

### Task G3: Web — section « Groupe cuisine » (/app/reglages)

**Files:** Create `apps/web/src/app/app/reglages/staff-group-card.tsx` + action dans `reglages/actions.ts` ; Modify `reglages/page.tsx`

- Spec exacte : bouton créer (action garde membre → décryptage DANS l'action → createGroup(`Cuisine ${nom}`) → getGroupInvite → écriture conditionnelle .is('staff_group_id', null) via client admin) ; état créé : lien copiable + QR (lib/qr) + aides FR. Catchs FR fixes, aucun handler serveur→client.
- [ ] Gate web. Commit `feat(web): groupe Cuisine — création et invitation depuis les réglages`.

---

### Task G4: Revue + prod + deploy

- [ ] Revue inline contrôleur. Migration 0023 prod + notify pgrst. Merge ff main + push + railway up. Test réel du bouton par Franck (action visible sur son compte). Ledger + mémoire.
