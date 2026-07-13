# Validation des statuts auto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Validation humaine (gérant boutons OU vote groupe) avant publication auto ; sans réponse = non publié ; refus → régénérer/annuler. Spec : `docs/superpowers/specs/2026-07-13-validation-statuts-design.md` (CONTRATS EXACTS — LIRE EN ENTIER).

## Global Constraints

- SÉCURITÉ : rien ne se publie sans validation explicite (pending non validé à l'heure → canceled). Machine bot PURE inchangée ; l'interception des boutons de validation vit dans le PROCESSOR, avant le flux machine (comme l'opt-out). Workers pattern maison, best-effort, horloge injectable (TZ Libreville UTC+1 fixe). Ids boutons : `stapp:` / `strej:` / `streg:` / `stcan:` + statusId. Gates (whapi 48+, bot 191+ côté service, web 191+, db+pgTAP). Branche `feature/validation-statuts`.

---

### Task VS1: Migration 0025 + whapi readPollVotes

**Files:** Create `supabase/migrations/20260713000025_validation_statuts.sql` + pgTAP `supabase/tests/database/12_validation_statuts.test.sql` ; Modify `packages/whapi/src/client.ts` + tests

- SQL (spec) : enum status_state += 'pending_approval' (ALTER TYPE ... ADD VALUE — hors transaction si besoin, vérifier ; sinon recréer via check si status_state est un text-check, LIRE 0012 pour savoir si enum PG ou text check) ; statuses += approval_message_id/approval_requested_at/auto_generated ; restaurants += auto_status_validation ('none'/'manager'/'group', default 'none')/auto_status_manager_phone. pgTAP ≥6 asserts.
- whapi readPollVotes(messageId) → { yes: number, no: number } via GET /messages/{id} (les compteurs de votes sont dans le corps du message poll — parsing défensif : localiser le tableau d'options avec leurs votes, matcher 'Oui'/'Non' insensible casse, fallback 0). Mock-fetch tests + doc de confiance.
- [ ] `supabase db reset` + suites vertes + gate whapi. Commit `feat(whapi,db): validation statuts — états, réglages, lecture des votes (migration 0025)`.

---

### Task VS2: Web — réglages validation (mode + numéro gérant)

**Files:** Modify `apps/web/src/app/app/marketing/statuts/{auto-status-card.tsx, actions.ts}`

- Section Statuts Auto (premium) : sélecteur « Validation avant publication » (Aucune/Gérant/Groupe staff) ; si Gérant → Input « Numéro du gérant validateur » (défaut placeholder = contact_phone, format E.164 permissif — helper pur + test) ; si Groupe → note FR « Le groupe Cuisine votera (créez-le d'abord) ». updateAutoStatus étendu : garde membre+premium, valide validation ∈ {none,manager,group}, phone si manager (permissif), écrit via client admin (pattern 3A).
- [ ] Gate web. Commit `feat(web): réglages de validation des statuts auto (mode + numéro gérant)`.

---

### Task VS3: Bot — worker génération avancée + dispatch + décision groupe (TDD)

**Files:** Modify `services/whatsapp/src/autostatus/{worker.ts,repo.ts}`, `services/whatsapp/src/statuses/worker.ts` ; Create `services/whatsapp/src/autostatus/decision-worker.ts` (+repo) ; config.ts ; index.ts ; tests

- auto-status worker : LEAD 120 min (générer quand now ≥ slot−120). Selon restaurants.auto_status_validation : 'none' → scheduled (inchangé) ; 'manager' → pending_approval + envoi (sendImage + sendQuickReplies Valider/Refuser au manager phone|contact_phone ; absent → failed FR) + stocke approval_message_id ; 'group' → pending_approval + sendImage + sendPoll(groupe, « Publier… ? », [Oui,Non]) + stocke poll id (staff_group_id absent → failed FR). auto_generated=true.
- decision-worker (mode group) : poll les statuts pending_approval group dont scheduled_at ≤ now → readPollVotes → Oui>Non & ≥1 → scheduled, sinon canceled FR. Log `[status-decision] démarré`.
- status worker : à l'heure, tout pending_approval (manager) dont scheduled_at ≤ now et non validé → canceled (« Non validé à temps — non publié. »). Publie uniquement scheduled (inchangé).
- TDD complet (lead, 3 modes de dispatch, manager/group absents → failed, decision Oui>Non/égalité/0, status worker cancel-if-pending, non-régression 'none').
- [ ] Gate bot. Commit `feat(bot): statuts auto — génération avancée, demande de validation, décision groupe`.

---

### Task VS4: Bot — processor interception des boutons de validation (TDD)

**Files:** Modify `services/whatsapp/src/processor.ts` (+ helper) ; Create `services/whatsapp/src/autostatus/approval.ts` (logique pure transitions) + repo méthodes ; tests

- Processor : réponses boutons dont l'id commence par `stapp:`/`strej:`/`streg:`/`stcan:` interceptées AVANT le flux machine (comme opt-out) → approval handler : stapp→scheduled+confirme ; strej→renvoie boutons Régénérer(streg)/Annuler(stcan) ; streg→régénère contenu (plat suivant cursor + caption) reste pending + renvoie image+boutons ; stcan→canceled. Garde : le statut doit être pending_approval du restaurant du canal (sécurité — pas de validation croisée). Best-effort, FR.
- approval.ts pur (parse id → action+statusId ; décision d'état) testé.
- TDD : chaque transition, id invalide ignoré, statut déjà traité/absent → message FR, régénération change le contenu.
- [ ] Gate bot complet. Commit `feat(bot): validation des statuts par boutons (valider/refuser/régénérer/annuler)`.

---

### Task VS5: Revue opus + prod + smoke réel

- [ ] review-package → opus (SÉCURITÉ n°1 : aucun statut publié sans validation ; interception boutons vs flux machine sans régression ; décision groupe seuils ; cancel-if-pending fiable ; auto_generated scoping). Fix wave.
- [ ] Migration 0025 prod + notify pgrst. Merge ff main + push + railway up. Smoke réel Chez Demo mode manager (numéro de Franck) : créneau à −119 min forcé → demande de validation reçue → Valider → publication ; puis Refuser→Annuler sur un autre. Ledger + mémoire.
