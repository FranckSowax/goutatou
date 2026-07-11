# Conversations WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/app/conversations` — inbox + fil des conversations du bot (lecture seule, realtime), entrée sidebar, lien wa.me pour répondre.

**Architecture:** Lecture `message_logs` via client membre (RLS), helpers purs de groupement testés, composant client realtime (pattern kanban), migration 0016 (publication realtime + index). Spec : `docs/superpowers/specs/2026-07-11-conversations-whatsapp-design.md`.

## Global Constraints

- AUCUN appel Whapi côté web, aucun token. Aucun changement bot/services.
- Fenêtre 30j / limit 800, plus récents d'abord (plafond PostgREST 1000 documenté).
- Non-lu = localStorage `gtt-conv-seen` (client only, pas de migration de lecture).
- Tokens light+dark, FR, gate web complet (`typecheck && test && build`, 97+N), jamais de build pendant une preview. Branche `feature/conversations`.

---

### Task 1: Migration 0016 + helpers purs conversations

**Files:** Create `supabase/migrations/20260711000016_message_logs_realtime.sql`, `apps/web/src/lib/conversations.ts`, `apps/web/test/conversations.test.ts`

```sql
alter publication supabase_realtime add table message_logs;
create index message_logs_resto_created_idx on message_logs (restaurant_id, created_at desc);
```
- Types : `ConversationLog {id, direction: 'in'|'out', chat_id, body: string|null, error: string|null, created_at}` ; `ConversationCustomer {chat_id, name: string|null, phone}`.
- `groupConversations(logs, customers)` : groupe par chat_id, tri lastAt desc, nom = customer.name ?? téléphone formaté (réutiliser le formatage existant de lib/lp/wa si exposé, sinon local), extrait = dernier body (tronqué 80c, fallback '—'), lastDirection.
- `threadFor(logs, chatId)` : messages du chat triés asc.
- TDD d'abord (groupement multi-chats, tri, fallback nom, extrait tronqué, thread asc, logs vides).
- [ ] Tests → implémentation → `supabase db reset` local OK (0016 passe) + gate web. Commit `feat(web): helpers conversations + migration realtime message_logs (0016)`.

---

### Task 2: Page /app/conversations + realtime + sidebar

**Files:** Create `apps/web/src/app/app/conversations/page.tsx` (server : fetch logs 30j limit 800 + customers du resto, passe au client), `apps/web/src/app/app/conversations/inbox.tsx` (client) ; Modify `apps/web/src/components/nav-links.tsx` (entrée « Conversations », icône MessagesSquare, entre Commandes et Menu)

- inbox.tsx : deux volets (`md:grid-cols-[20rem_1fr]`), liste (nom, extrait, heure relative FR, pastille non-lu via localStorage gtt-conv-seen — marquer vu à l'ouverture du fil), fil (bulles in gauche bg-card border / out droite bg-primary text-primary-foreground, horodatage, « non délivré » destructive si error), état vide FR (« Aucune conversation — les échanges du bot apparaîtront ici. »), bouton « Ouvrir dans WhatsApp » (wa.me/{phone} — helper existant lib/lp/wa).
- Realtime : channel INSERT message_logs filter restaurant_id (pattern notifications-bell/kanban), append optimiste au state local. Cleanup à l'unmount.
- Mobile : liste seule → fil avec bouton retour (state, pas de route).
- [ ] Gate web complet. Commit `feat(web): page conversations bot (inbox, fil realtime, wa.me)`.

---

### Task 3: QA + revue + deploy

- [ ] Contrôleur : preview locale (seed local message_logs si vide), light+dark, 375px, realtime (insert SQL local → apparition live). Revue inline du diff (petit chantier).
- [ ] Migration 0016 prod (MCP) + `notify pgrst, 'reload schema'` + merge ff main + push (Netlify). Smoke : insert message_logs test sur Chez Demo en prod → visible sur la page (puis delete). Ledger + mémoire.
