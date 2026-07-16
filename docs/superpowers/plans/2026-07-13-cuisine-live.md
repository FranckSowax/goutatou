# Cuisine Live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal :** une nouvelle commande (ou une arrivée Drive) devient **impossible à rater** en cuisine : overlay plein écran + carillon, branchés sur le Supabase Realtime existant ; et le client Drive peut signaler « je suis arrivé » depuis WhatsApp.

**Architecture :** on porte le **comportement** d'un dashboard de référence (overlay, minutages, idempotence, carillon Web Audio) mais **pas son transport** : le SSE de référence suppose un serveur long-vivant avec un `Set` de clients en mémoire — impossible sur Netlify serverless. On branche sur **Supabase Realtime** (déjà utilisé à 5 endroits). L'arrivée Drive passe par le **bot WhatsApp** (bouton interactif).

**Spec :** `docs/superpowers/specs/2026-07-13-cuisine-live-design.md` — **lis-la, elle porte les rejets et leurs raisons.**

## Global Constraints

- **Palette de référence INTERDITE.** Tout par token sémantique Goutatou (`--primary`, `--tint-mint`, `--tint-sky`, `--destructive`, `--font-display`, `--radius`). Aucune valeur en dur hors tokens.
- **Ne PAS créer d'endpoint SSE** ni `/api/menu/public`. Ne pas toucher au Menu Studio.
- **Idempotence partout** : `Set` des ids vus côté client (Realtime peut redélivrer) ; `markArrived` conditionnel en SQL.
- **`prefers-reduced-motion`** : pas de clignotement (apparition/disparition simples). Le son reste.
- **Audio** : débloqué au 1er geste (`document.addEventListener('click', ensureAudio)`). **Pas de bascule 🔔** (choix Franck). Assumé : une commande avant tout clic → overlay sans son.
- Jamais de prop fonction Server→Client. FR partout. `notify pgrst` après DDL.
- Bot : le préfixe `arr:` est intercepté **avant le flux machine** (pattern `stapp:`/`chapp:`) et **réutilise `matchButtonInput`** (le round-trip d'id de bouton n'est pas fiable).

---

## Task CL1 — Migration 0030 + carillon + helpers purs

**Files :** Create `supabase/migrations/20260713000030_drive_arrival.sql`, `apps/web/src/lib/chime.ts`, `apps/web/src/lib/live-alert.ts`, `apps/web/test/live-alert.test.ts`.

**Migration** (idempotente) :
```sql
alter table orders add column if not exists arrived_at timestamptz;
alter table orders add column if not exists arrival_note text;
notify pgrst, 'reload schema';
```
Ne PAS appliquer en prod (c'est CL5).

**`lib/chime.ts`** — module Web Audio **générique, indépendant du design**, porté tel quel de la spec :
`ensureAudio()`, `chime(ctx, t0)` (2 notes sinus 880 Hz + 1174.66 Hz à +0.15 s, enveloppe exponentielle ~0.9 s), `startAlert()` (5 rappels espacés de 2 s puis silence), `stopAlert()`. Aucun fichier audio (CSP-safe). Tout en try/catch : un navigateur sans Web Audio ne doit jamais casser la page.

**`lib/live-alert.ts`** (PUR, TDD — tests d'abord) :
```ts
export type LiveEvent = { kind: 'order'; id: string; code: string; amount: number }
                      | { kind: 'arrival'; id: string; code: string; note: string | null }
/** Décide s'il faut alerter pour cette ligne `orders` reçue du Realtime, en tenant compte des ids
 *  déjà vus (idempotence : le Realtime peut redélivrer). Mute `seen`. */
export function decideAlert(
  evt: { type: 'INSERT' | 'UPDATE'; row: { id: string; order_number: number; total: number; mode: string; arrived_at: string | null; arrival_note: string | null }; oldArrivedAt?: string | null },
  seen: Set<string>,
): LiveEvent | null
```
Règles : `INSERT` → `{kind:'order'}` si `id` pas dans `seen` (puis ajouter `id`) ; `UPDATE` où `arrived_at` passe de `null`/absent → non-null → `{kind:'arrival'}` si `arr:<id>` pas dans `seen` (puis ajouter) ; tout le reste → `null`.
**Tests obligatoires** : INSERT neuf → order ; même INSERT 2× → null la 2e fois ; UPDATE arrived_at null→date → arrival ; le même UPDATE 2× → null ; UPDATE sans changement d'arrived_at → null ; UPDATE date→date → null ; un même id peut produire order PUIS arrival (clés distinctes).

**Vérifie** : `pnpm --filter @goutatou/web test` + typecheck. Commit `feat(web,db): migration 0030 + carillon + helpers alerte live`.

---

## Task CL2 — Overlay plein écran branché sur le Realtime

**Files :** Create `apps/web/src/app/app/live-alert-overlay.tsx` (client) ; Modify `apps/web/src/app/app/layout.tsx`.

**Interfaces consommées :** `decideAlert`/`LiveEvent` (CL1), `startAlert`/`stopAlert`/`ensureAudio` (CL1).

- **Monté dans le layout `/app`** → le gérant est alerté quelle que soit la page. Le layout est un Server Component : ne lui passe que des données (le `restaurantId` du membre).
- Canal Supabase Realtime sur `orders` — **imite `apps/web/src/app/app/commandes/board.tsx:70`** (`supabase.channel(...).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, …)`). Filtre par `restaurant_id` (la RLS s'applique déjà, mais filtre aussi côté payload). Pour l'UPDATE, `postgres_changes` fournit `payload.old` si le REPLICA IDENTITY le permet — **si `old.arrived_at` n'est pas disponible, replie sur le `Set` d'idempotence** (`arr:<id>` déjà vu ⇒ pas de ré-alerte) : c'est exactement ce que `decideAlert` gère. **Documente ce que tu observes.**
- **Deux overlays** `fixed inset-0 z-[100]`, cachés par défaut, `role="alert"` :
  1. **Nouvelle commande** → `--tint-mint` : « NOUVELLE COMMANDE », **`#<order_number>` en très grand** (`font-display`, énorme), total via `formatFcfa`, ligne « Toucher pour fermer ».
  2. **Client arrivé** → `--tint-sky` : « CLIENT ARRIVÉ — À REMETTRE », `#<order_number>`, + `arrival_note` si présent.
- **Fermeture** : tap n'importe où **OU** auto (**10 s** commande / **15 s** arrivée) → `stopAlert()` dans les deux cas.
- **Ré-armement** si un 2e événement arrive pendant l'affichage : `remove('on')` → `void el.offsetWidth` → `add('on')`.
- **`prefers-reduced-motion`** : pas de clignotement (transition simple). Le son reste.
- `ensureAudio` au 1er clic (`document.addEventListener('click', ensureAudio)`), `startAlert()` à l'ouverture d'un overlay.

**Vérifie** : test + typecheck + build verts. Commit `feat(web): overlay plein écran + carillon sur le Realtime`.

---

## Task CL3 — Arrivée Drive (bot + badge Kanban)

**Files :** Modify `services/whatsapp/src/notifier.ts`, `services/whatsapp/src/processor.ts`, `services/whatsapp/src/repo.ts` (ou un repo dédié) ; tests bot ; Modify `apps/web/src/app/app/commandes/board.tsx` (badge).

**À étudier :** `notifier.ts` (~44 `MODE_LABELS_FR`, ~74 `MakeWhapi`, ~123 `sendInteractiveUrl` — modèle d'envoi au client), `processor.ts` (interception `stapp:`/`chapp:` **avant le flux machine**), `bot/buttons.ts` (`matchButtonInput`), `bot/machine.ts`.

1. **Notifier** : quand une commande passe en `prete` (ou à la création — **choisis le moment le plus utile pour un drive et justifie-le**) ET `mode === 'drive'`, envoyer au client, **en plus du message de statut existant** (ne le remplace pas), un bouton **« ✅ Je suis arrivé »** via `sendQuickReplies` avec l'id `arr:<orderId>`. Best-effort : un échec est logué, jamais bloquant. Étendre le type `MakeWhapi` en conséquence.
2. **Processor** : intercepter `arr:` **avant le flux machine** (même emplacement que `stapp:`/`chapp:`). Réutiliser `matchButtonInput` pour le cas où l'id ne revient pas (round-trip non fiable). Handler :
   - parse `arr:<orderId>` ;
   - **gardes** : la commande existe, appartient au resto du canal, `mode='drive'`, statut ∉ {`recuperee`,`annulee`} → sinon réponse FR neutre (« Cette commande n'est plus en attente. ») ;
   - `markArrived(orderId, note)` : `update orders set arrived_at = now() where id = ? and arrived_at is null` → **idempotent** (2e tap = 0 ligne → ne pas ré-répondre « c'est noté », répondre neutre) ;
   - réponse FR : « C'est noté, on vous apporte votre commande ! ».
   - `arrival_note` : v1 **optionnelle** — si tu peux capter un texte libre juste après le tap sans complexifier la machine, fais-le ; sinon laisse `null` et **documente le choix**. Le bouton seul suffit à déclencher l'alerte.
3. **Badge Kanban** (`commandes/board.tsx`) : commande `mode='drive'` → « 🚗 Drive » (`--tint-sky` atténué) ; si `arrived_at` → « 🚗 ARRIVÉ » (sky plein) + `arrival_note` en `title`. Le board doit sélectionner `arrived_at`/`arrival_note`.

**Tests bot** : `markArrived` idempotent (2e appel = no-op) ; gardes (mauvais resto / mode ≠ drive / déjà récupérée → pas d'écriture, réponse neutre) ; tap valide → écriture + réponse FR ; non-régression des interceptions `stapp:`/`chapp:` existantes.

**Vérifie** : `pnpm --filter @goutatou/service-whatsapp test` + `pnpm --filter @goutatou/web test` + typecheck. Commit `feat(bot): arrivée Drive « je suis arrivé » + badge cuisine`.

---

## Task CL4 — Langage d'interaction

**Files :** `apps/web/src/app/app/commandes/board.tsx` + composants de badge partagés si pertinent.

- **Pastille live** : passe à `--primary` quand le canal Realtime est `SUBSCRIBED` (le board a déjà le canal — expose son statut).
- **Badges d'état** : pilule compacte, majuscules, `letter-spacing`, **un badge = un rôle sémantique** (payé/`--primary`, sur place/`--accent`, arrivée/`--tint-sky`, annulé/`--destructive`). Jamais de couleur en dur. Factorise si le repo a déjà un `Badge`.
- **Montants** en `tabular-nums`.
- **Ligne fraîche** : pulse ~2,4 s à l'insertion — **respecte `prefers-reduced-motion`**.
- **Dropdown « Outils »** : range les actions techniques hors du flux principal, ferme au clic extérieur. **Ne l'ajoute que s'il y a réellement des actions techniques à ranger** sur cet écran — sinon **saute cet item et dis-le** (pas de UI vide).

**Vérifie** : test + typecheck + build. Commit `feat(web): langage d'interaction cuisine (badges, live, pulse)`.

---

## Task CL5 — Revue + prod + deploy

1. `pnpm -w test` (web + bot) + builds verts.
2. Revue finale (modèle capable) via `scripts/review-package`. Cibler : **aucune palette de référence importée** (tout par token) ; idempotence overlay (pas de double alerte sur redélivrance Realtime) ; `markArrived` idempotent + gardes multi-tenant/mode/état ; non-régression des interceptions de boutons existantes (`stapp:`/`chapp:`) et du notifier ; `prefers-reduced-motion` respecté ; aucun endpoint SSE/public ajouté.
3. Migration 0030 prod via MCP Supabase de service + `notify pgrst` + round-trip.
4. Merge `feature/cuisine-live` → main, push. Netlify auto + **Railway obligatoire** (notifier + processor modifiés).
5. Ledger + mémoire.
6. Smoke Franck : 2 onglets `/app` → commande drive depuis WhatsApp → overlay mint + carillon → taper « ✅ Je suis arrivé » → overlay sky + carillon + badge ARRIVÉ ; vérifier tap-to-close, auto-close, et qu'un double-tap ne réalerte pas.

## Self-review (couverture spec)
- Overlay + minutages + idempotence + ré-armement → CL1 (helpers) + CL2 ✓
- Carillon Web Audio + déblocage 1er geste + pas de bascule → CL1 + CL2 ✓
- Arrivée Drive (bouton, gardes, idempotence, badge) → CL3 + migration CL1 ✓
- Langage d'interaction → CL4 ✓
- Rejets (SSE, menu public, CRUD catalogue, ligne vietnamienne) → Global Constraints ✓
- Table de correspondance / palette → Global Constraints ✓
