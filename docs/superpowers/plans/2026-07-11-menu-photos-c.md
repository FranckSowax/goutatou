# Menu Studio — Lot C (photos bot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** La commande MENU du bot envoie les photos des plats (image + légende « Nom — prix FCFA »), throttlée anti-ban, plafonnée, avec fallback texte complet. Spec : section « Lot C — Photos bot » de `docs/superpowers/specs/2026-07-11-menu-studio-design.md`.

## Global Constraints

- services/whatsapp uniquement (aucun changement web/db — `packages/whapi.sendImage` existe déjà).
- La machine reste PURE : l'envoi des photos est un effet du processor APRÈS la réponse MENU texte (le texte du menu reste la source canonique — les photos sont un complément).
- Throttle : réutiliser `campaigns/throttle.ts` (nextSendDelayMs) entre chaque image ; cap `MENU_PHOTOS_MAX` (env, défaut 8) ; ordre du menu (catégories/plats par position) ; plats disponibles avec photo_url seulement.
- Échec d'un envoi image → log `[menu-photos]` + continuer (le client a déjà le menu texte) ; AUCUN throw qui casserait le flux conversationnel ; logMessage 'out' pour chaque image envoyée (body = légende, dédup par message id whapi).
- Gate bot : `pnpm --filter @goutatou/service-whatsapp typecheck && test` (100+N). Branche `feature/menu-photos-c`.

---

### Task 1: Repo photo_url + envoi photos processor (TDD)

**Files:** Modify `services/whatsapp/src/repo.ts` (menu query + photo_url), `services/whatsapp/src/processor.ts` (envoi photos après réponse MENU), `services/whatsapp/src/config.ts` (MENU_PHOTOS_MAX défaut 8), types menu bot (photoUrl optionnel — packages/db types si c'est là que vit MenuForBot) ; tests processor étendus (mocks whapi existants).

- Repo : select menu_items gagne `photo_url` ; mapping → `photoUrl: string | null` dans le menu bot.
- Processor : quand la transition a rendu le MENU (détecter proprement : la commande entrante était 'menu' — même détection que le routage global existant), après l'envoi du texte : lister les plats disponibles avec photoUrl dans l'ordre du menu, cap MENU_PHOTOS_MAX, pour chaque → `whapi.sendImage(chat_id, photoUrl, "Nom — X FCFA")` + logMessage 'out' + sleep(nextSendDelayMs(...)) entre les envois (pas après le dernier). try/catch par image (log + continue).
- Config : `MENU_PHOTOS_MAX` (int env, défaut 8, min 0 — 0 = photos désactivées).
- TDD : menu sans photos → aucun sendImage (non-régression) ; 3 plats avec photos → 3 sendImage ordre menu + légendes correctes ; cap à MENU_PHOTOS_MAX ; plat indisponible/sans photo exclu ; échec sendImage → les suivants partent quand même ; sleep appelé entre envois.
- [ ] Gate bot. Commit `feat(bot): photos du menu en conversation (throttlées, cap, fallback texte)`.

---

### Task 2: Revue + deploy Railway + smoke

- [ ] Revue inline contrôleur (diff court). Merge ff main + push. `railway up --detach --service whatsapp-bot` + logs de démarrage sains.
- [ ] Smoke réel impossible sans canal scanné (QR toujours en attente) → smoke = tests + logs Railway. Ledger + mémoire.
