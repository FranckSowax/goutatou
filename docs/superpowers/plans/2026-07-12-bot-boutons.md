# Bot boutons + suppléments panier natif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Choix fermés en boutons/listes WhatsApp (fallback texte), suppléments proposés sur panier catalogue. Spec : `docs/superpowers/specs/2026-07-12-bot-boutons-design.md` (CONTRATS EXACTS — la lire en entier).

## Global Constraints

- Boutons = COUCHE processor ; machine jamais consciente des boutons (ids `in:<texte>` retraduits en entrées texte). Fallback texte OBLIGATOIRE sur tout échec interactif.
- Ajouts machine PURS uniquement (SUPPLEMENTS_CHECKOUT, beginCheckout étendu, CartItem.suppAsked) — états/flux existants byte-identiques (non-régression testée).
- Payloads/shapes Whapi vérifiés (skill msg-interactive.md — règles anti-hallucination — + doc incoming officielle pour les réponses). Gates (whapi 32+, bot 235+). Branche `feature/bot-boutons`.

---

### Task X1: whapi — quick replies + listes + shapes de réponse

**Files:** Modify `packages/whapi/src/client.ts` + tests

- sendQuickReplies / sendList selon la spec (payloads exacts de msg-interactive.md : buttons quick_reply title/id À PLAT, action.list.label + sections[].rows). VÉRIFIER sur support.whapi.cloud incoming-message la shape des réponses bouton et liste entrantes (le rapport doit la documenter pour X3, avec confiance).
- [ ] Gate whapi (32+2) + typecheck bot. Commit `feat(whapi): boutons quick-reply et listes interactives`.

---

### Task X2: Machine — SUPPLEMENTS_CHECKOUT + beginCheckout étendu (TDD)

**Files:** Modify `services/whatsapp/src/bot/machine.ts` (ajouts purs), `packages/db/src/types.ts` (CartItem.suppAsked?) ; tests machine dédiés

- Contrats exacts de la spec. TDD : beginCheckout sans suppléments = comportement actuel (test existant rejoué), avec suppléments → SUPPLEMENTS_CHECKOUT + item ciblé en dernier ; sélection/dédup/invalide identiques à SUPPLEMENTS ; sortie → item suivant non demandé (multi-items) ; sortie finale → MODE avec récap+chooseMode identiques ; suppAsked posé ; commandes globales (menu/panier/annuler) depuis le nouvel état cohérentes (mêmes règles que SUPPLEMENTS) ; flux valider/SUPPLEMENTS existants inchangés.
- [ ] Gate bot. Commit `feat(bot): machine — suppléments enchaînés sur panier importé (SUPPLEMENTS_CHECKOUT)`.

---

### Task X3: Processor — interactif sortant/entrant (TDD)

**Files:** Modify `services/whatsapp/src/processor.ts` (+ helpers), tests processor

- Dépend X1+X2. Sortie : construire les boutons par état résultant (MODE : modes dispo via availableModes/ctx — LIRE la machine ; SUPPLEMENTS/SUPPLEMENTS_CHECKOUT : suppléments du DERNIER item + « Non merci » (id in:0) ; CONFIRMATION : question exacte lue dans la machine → Oui (in:oui) / Annuler (in:annuler)). Dernière réponse du lot envoyée en interactif (body = texte original), ≤3 → quick replies, sinon liste ; catch → sendText original + log `[buttons]`. logMessage 'out' inchangé (le texte).
- Entrée : type 'reply' → id `in:x` → input x ; title en fallback ; logMessage 'in' = title lisible. Autres types inchangés.
- TDD : mode → 3 boutons corrects ; suppléments 2 → 3 boutons (2+Non merci) ; suppléments 5 → liste ; confirmation → 2 boutons ; échec interactif → texte fallback envoyé ; reply in:2 → machine reçoit '2' ; panier natif avec plat à suppléments → SUPPLEMENTS_CHECKOUT + boutons, puis 0 → MODE + boutons (bout-en-bout) ; flux texte pur sans régression.
- [ ] Gate bot complet. Commit `feat(bot): boutons WhatsApp sur les choix fermés + suppléments du panier natif`.

---

### Task X4: Revue + deploy + test réel

- [ ] Revue inline contrôleur (fallbacks, ids, non-régression). Merge ff main + push + railway up (pas de migration). Test réel Franck : panier natif Poulet DG → boutons suppléments → mode → confirmation → kanban + groupe. Si les quick-reply ne s'affichent pas chez lui → basculer la décision sondages-comme-boutons (backlog activable). Ledger + mémoire.
