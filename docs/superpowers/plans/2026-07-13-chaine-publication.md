# Chaîne WhatsApp — rattachement + publication Pro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Détecter/rattacher une chaîne existante (admin) + composer de post manuel Pro (texte/photo/vidéo/album/sondage) + historique/abonnés. Spec : `docs/superpowers/specs/2026-07-13-chaine-publication-design.md` (CONTRATS EXACTS).

## Global Constraints

- Pas de migration (wa_channel_id/wa_channel_invite existent déjà, migration 0019). Token décrypté DANS les actions serveur, jamais côté client. Endpoints whapi vérifiés (manifest whapi-mcp), parsing défensif + confiance annoncée. Vidéo = upload direct navigateur→storage (jamais Server Action). Gates (whapi 42+, web 155+). Branche `feature/chaine-publication`.

---

### Task CH1: whapi — getNewsletters, sendChannelVideo, getChannelMessages

**Files:** Modify `packages/whapi/src/client.ts` + tests

- getNewsletters() → Array<{id,name,picture?,role?,subscribers?}> (GET /newsletters, count=100) ; sendChannelVideo(newsletterId, mediaUrl, caption?) (POST /messages/video, to=newsletterId) ; getChannelMessages(newsletterId, count=20) (GET /newsletters/{id}/messages). Parsing défensif, confiance par endpoint dans le rapport (schémas réponse partiellement non documentés). Mock-fetch tests.
- [ ] Gate whapi (42+3) + bot typecheck. Commit `feat(whapi): chaîne — liste, vidéo, historique des posts`.

---

### Task CH2: Admin — détection + rattachement chaîne (fiche onglet Bot)

**Files:** Modify `apps/web/src/app/admin/restaurants/[id]/{bot-tab.tsx, actions.ts, page.tsx}`

- Section « Chaîne WhatsApp » dans l'onglet Bot (rendue si canal configuré) : bouton « Détecter ma chaîne » → action detectChannels(id) (assertPlatformAdmin → token décrypté DANS l'action → getNewsletters → renvoie seulement {id,name,picture,subscribers} des chaînes possédées) → liste cliquable ; « Rattacher » → attachChannel(id, newsletterId) (garde admin, écrit wa_channel_id + wa_channel_invite via getNewsletter, écriture conditionnelle .is('wa_channel_id', null) OU écrasement explicite si re-rattachement — permettre le re-choix : ici pas de .is guard, on écrase volontairement, c'est l'admin). Déjà rattachée → badge nom. Aucun handler serveur→client (données/ReactNode). Catchs FR fixes.
- [ ] Gate web. Commit `feat(web): admin — détecter et rattacher la chaîne WhatsApp existante`.

---

### Task CH3: Web — composer de post chaîne + historique

**Files:** Modify `apps/web/src/app/app/marketing/chaine/{page.tsx, composer.tsx, actions.ts}` (+ helpers ; réutiliser status-media direct upload)

- Composer par type (Texte/Photo/Vidéo/Album/Sondage) selon spec. Actions (garde membre → token décrypté DANS l'action) : postChannelText, postChannelImage (upload image comme aujourd'hui côté chaîne ou statuts), postChannelVideo (path storage validé `${restaurantId}/`), postChannelCatalog (plats dispo+photo, cap 10, throttle — best-effort, retourne le compte envoyé/échoué), postChannelPoll (2-12 options). En-tête : nom + abonnés (getNewsletter) + invite + QR (lib/qr). Historique : getChannelMessages (lecture seule, aperçu + date FR). FR, tokens, no server→client handlers.
- [ ] Gate web complet. Commit `feat(web): chaîne — composer (texte/photo/vidéo/album/sondage) + historique`.

---

### Task CH4: Revue + deploy + test réel

- [ ] Revue inline contrôleur (token flow, gating Pro, upload path, album throttle/cap). Merge ff main + push + railway up (pas de worker nouveau ; whapi utilisé côté web actions — vérifier que le bot n'a rien à redéployer SAUF si packages/whapi impacte le bot : oui le bot dépend de whapi → railway up quand même par sûreté). Test réel Franck : détecter+rattacher sa chaîne, publier texte/photo/album. Ledger + mémoire.
