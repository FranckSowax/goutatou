# Studio Statuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Statuts vidéo + séries programmées + preview WhatsApp + audience VIP + Statuts Auto premium (génération menu). Spec : `docs/superpowers/specs/2026-07-12-studio-statuts-design.md` (CONTRATS EXACTS — LIRE EN ENTIER).

## Global Constraints

- Vidéos : upload direct navigateur→storage UNIQUEMENT (jamais de Server Action — leçon hero LP). Workers pattern maison, best-effort. Moteur de captions PUR et TDD (le web en duplique le rendu, contrat partagé dans la spec).
- Extensions whapi SANS casser les signatures utilisées par le status worker actuel (lire les appels avant). TZ créneaux : Africa/Libreville.
- Gates (whapi 38+, bot 262+, web 121+, db+pgTAP). Branche `feature/studio-statuts`.

---

### Task ST1: Migration 0024 + whapi story étendu

**Files:** Create `supabase/migrations/20260712000024_studio_statuts.sql` (SQL spec — VÉRIFIER le nom de la contrainte kind dans 0012 avant drop) ; Modify `packages/whapi/src/client.ts` + tests

- postStatusText/postStatusMedia étendus (opts backgroundColor/captionColor/fontType/contacts ; media vidéo mime video/mp4) — champs confirmés par le manifest whapi-mcp (sendMessageStory*). Rétrocompat : appels existants sans opts inchangés (tests existants verts sans modification).
- [ ] `supabase db reset` + suites vertes + gate whapi. Commit `feat(whapi,db): statuts vidéo, styles, audience + réglages auto (migration 0024)`.

---

### Task ST2: Bot — status worker étendu + auto-status worker (TDD)

**Files:** Modify `services/whatsapp/src/statuses/{repo,worker}.ts` ; Create `services/whatsapp/src/autostatus/{captions.ts,repo.ts,worker.ts}` + tests ; `config.ts` (+AUTO_STATUS_POLL_MS défaut 5 min), `index.ts`

- Status worker : kind video (mime), styles, audience optin → contacts (repo opt-in chat_ids ; vide → failed FR spec). Auto-status : contrat spec intégral (claim last_slot conditionnel « YYYY-MM-DD HH:MM » Libreville, rotation cursor plats dispo AVEC photo, buildStatusCaption pur ≥6 gabarits variés — index gabarit = (cursor + jour) % n —, insert statuses scheduled). TDD complet (créneau dû/déjà exécuté/lendemain, rotation sans répétition immédiate, 0 photo skip, premium+enabled+canal requis, captions variés).
- [ ] Gate bot. Commit `feat(bot): statuts vidéo/styles/VIP + worker statuts auto (menu)`.

---

### Task ST3: Web — composer multi-cartes + vidéo + preview

**Files:** Rework `apps/web/src/app/app/marketing/statuts/{form.tsx→composer multi-cartes, page.tsx, actions.ts}` + nouveau composant preview ; upload direct vidéo (pattern `admin/lp/[restaurantId]/hero-upload.tsx` — LIRE)

- Spec exacte : cartes texte/image/vidéo, styles texte (6-8 fonds WhatsApp + couleur légende + police select 0-5), audience par carte (Tous / VIP 👑 premium-gated), publication « à la suite » (étagement 2 min) ou heure/carte, preview 9:16 (composer + dialog historique). createStatus action étendue (bg_color/caption_color/font_type/audience/kind video+media path validé `${restaurantId}/`). AUCUN handler serveur→client ; catchs FR.
- [ ] Gate web. Commit `feat(web): studio statuts — multi-cartes, vidéo, styles, preview, VIP`.

---

### Task ST4: Web — section Statuts Auto (premium)

**Files:** Create `apps/web/src/app/app/marketing/statuts/auto-status-card.tsx` + `auto-caption-preview.ts` ; Modify `statuts/page.tsx`, `statuts/actions.ts`

- Dépend ST3 (page remaniée). Spec : gate premium (upsell card pattern), toggle + 1-2 créneaux HH:MM (validation serveur regex) + count 1-3, aperçu du prochain statut (plat suivant du cursor + caption dupliquée TS web, MÊME CONTRAT que captions.ts bot — gabarits identiques), dernier créneau. Action updateAutoStatus (garde membre + premium, écriture restaurants via client admin pattern 3A).
- [ ] Gate web. Commit `feat(web): statuts auto premium — réglages et aperçu`.

---

### Task ST5: Revue opus + prod + smoke réel

- [ ] review-package → opus (audience VIP = envoi ciblé sensible ; auto-status = contenu auto-publié sur le compte du resto : quotas/claim/rotation ; upload vidéo direct : path traversal/size ; non-régression statuts existants). Fix wave.
- [ ] Migration 0024 prod + notify pgrst. Merge ff main + push + railway up. Smoke réel : Chez Demo premium → auto_status_times = [maintenant+5min] via SQL → vérifier génération + publication réelle sur le canal (statuts visibles) ; un statut vidéo manuel de test si Franck fournit un mp4, sinon backlog. Ledger + mémoire.
