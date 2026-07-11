# Marketing + connexion à distance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Sidebar Marketing (statuts/chaîne/campagnes/QR opt-in) + connexion du numéro à distance. Spec : `docs/superpowers/specs/2026-07-12-marketing-design.md` (contrats exacts — LIRE EN ENTIER).

## Global Constraints

- Machine bot PURE ; mots-clés = mêmes patterns que `menu`/`infos` ; opt-in écrit par le PROCESSOR (effet), pas la machine.
- Token canal : décrypté uniquement côté serveur (actions web via TOKEN_ENCRYPTION_KEY), jamais loggé, jamais renvoyé au client.
- Pages statuts/campagnes déplacées SANS changement fonctionnel (gating inchangé). Anciennes routes = redirect().
- Erreurs Whapi côté client : messages FR fixes. Endpoints whapi : vérifier dans `.agents/skills/whapi/references/` avant d'écrire (jamais deviner).
- Gates par paquet (web 115+, bot 134+, whapi 10+, db). Branche `feature/marketing`.

---

### Task M1: Migration 0019 + bot mots-clés ROUE/PROMOS (TDD)

**Files:** Create `supabase/migrations/20260712000019_marketing.sql` ; Modify `services/whatsapp/src/bot/{machine.ts,copy.ts}`, `src/processor.ts`, `src/repo.ts` ; Test `services/whatsapp/test/machine-keywords.test.ts`

- SQL : `alter table customers add column marketing_opt_in boolean not null default false;` + `alter table restaurants add column wa_channel_id text, add column wa_channel_invite text;`
- Machine : commandes globales `roue` et `promos` (après garde HUMAIN, comme `infos`) — état/panier conservés. `roue` : ctx gagne `wheel?: { enabled, triggerOrders, orderCount }` (injecté par processor via repo) → copy.roue (pitch + « Plus que X commandes… » ou programme si disabled). `promos` : réponse fixe opt-in (copy.promos) + la machine signale l'effet via le résultat (pattern existant pour les effets processor — regarder comment l'opt-out STOP est détecté aujourd'hui et faire pareil : détection dans le processor, PAS dans la machine, si c'est le pattern actuel).
- Processor : sur mot-clé promos → `repo.setMarketingOptIn(customerId, true)` best-effort. Repo : + orderCount client (count orders) pour le contexte roue.
- TDD : roue enabled/disabled/progression, promos réponse, opt-in appelé, non-régression (menu/infos inchangés).
- [ ] `supabase db reset` + suites vertes + gate bot. Commit `feat(bot): mots-clés ROUE et PROMOS + opt-in marketing (migration 0019)`.

---

### Task M2: packages/whapi — newsletters + login à distance

**Files:** Modify `packages/whapi/src/client.ts` + tests

- VÉRIFIER les endpoints dans .agents/skills/whapi (références newsletters + users/login). Ajouter : createNewsletter(name), getNewsletterInvite(id) (ou équivalent retourné à la création), sendNewsletterText(id, body), sendNewsletterImage(id, mediaUrl, caption?), getLoginQr() (base64), getLoginCode(phone). Mock-fetch tests par méthode (payload + parsing), pattern existant.
- [ ] Gate whapi + bot typecheck (aucun impact runtime bot). Commit `feat(whapi): newsletters + login à distance (QR base64, code d'appairage)`.

---

### Task M3: Web — shell Marketing + déplacements + QR opt-in

**Files:** Create `apps/web/src/app/app/marketing/{layout.tsx,page.tsx}`, `apps/web/src/app/app/marketing/qr/page.tsx` (+ composants), déplacer `app/statuts/**` → `app/marketing/statuts/**` et `app/campagnes/**` → `app/marketing/campagnes/**` (git mv, imports ajustés, AUCUN changement fonctionnel) ; anciens `app/{statuts,campagnes}/page.tsx` = `redirect()` ; Modify `nav-links.tsx` + `app/layout.tsx` (Marketing remplace Campagnes et Statuts) ; `pnpm --filter @goutatou/web add qrcode` (+ @types si besoin)

- Layout marketing : sous-nav 4 onglets (liens segments, actif par pathname — pattern nav existant) ; /app/marketing → redirect statuts.
- QR : helper serveur `lib/qr.ts` (qrcode → SVG string) + page par cartes (spec : wa.me du canal, 4 mots-clés fixes, compteur 30 j via count message_logs ilike, download SVG, état vide sans canal). PAS d'appel Whapi ici.
- [ ] Gate web complet. Commit `feat(web): section Marketing (statuts/campagnes déplacés, générateur QR opt-in)`.

---

### Task M4: Web — Chaîne WhatsApp + connexion à distance (fiche admin)

**Files:** Create `apps/web/src/app/app/marketing/chaine/{page.tsx,actions.ts,composer.tsx}` ; Modify `apps/web/src/app/admin/restaurants/[id]/{bot-tab.tsx,actions.ts}`

- Dépend de M2 (client whapi) et M3 (layout marketing). Chaîne : spec exacte (création, invite + QR réutilisant lib/qr, composer texte/image immédiat). Actions : garde membre → décryptage token (lire le pattern de décryptage existant côté admin configureWebhook — ATTENTION backlog connu : ne jamais mettre le token en clair dans un bind client ; décrypter DANS l'action) → whapi.
- Admin : section « Connexion du numéro » de l'onglet Bot (code d'appairage + QR base64, actions admin, spec exacte).
- [ ] Gate web complet. Commit `feat(web): chaîne WhatsApp + connexion du numéro à distance`.

---

### Task M5: Revue finale + prod + smoke

- [ ] review-package → revue opus (décryptage token dans les nouvelles actions web = surface n°1, opt-in processor, redirects/gating inchangés, QR wa.me correct). Fix wave unique.
- [ ] Migration 0019 prod + notify pgrst. Merge ff main + push + railway up. Smoke : /app/marketing/* en prod (redirects, QR cards sur Chez Demo impossible sans canal → vérifier l'état vide FR), mots-clés bot via tests. Ledger + mémoire.
