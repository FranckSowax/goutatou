# Goutatou Phase 3B (Statuts WhatsApp programmés) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un restaurant Pro de composer et programmer des statuts WhatsApp (stories) publiés automatiquement sur son canal à l'heure prévue, via un worker sur le service Railway.

**Architecture:** Les statuts sont créés dans `apps/web` (`/app/statuts`, gating Pro). Le service bot Railway héberge un **status worker** (même patron que le campaign worker) : il poll les statuts `scheduled` échus, les publie via l'API Whapi (`POST /messages/story/text` ou `/messages/story/media`), et marque `posted`/`failed`. Volume faible, throttle léger.

**Tech Stack:** monorepo pnpm existant · TypeScript strict · services/whatsapp (Railway) · Supabase (Postgres + RLS + Storage) · Next.js 15 (Netlify) · Vitest.

## Global Constraints

- Textes FR ; TypeScript `"strict": true`.
- Worker et actions serveur uniquement (service-role) ; composants client importent uniquement `@goutatou/db/types`.
- Gating **Pro** : `subscriptions.plan in ('pro','premium')` ET `status='active'` — réutiliser `assertPlan(['pro','premium'])` de `apps/web/src/lib/premium.ts` (phase 3A).
- Endpoint Whapi statut texte : `POST /messages/story/text` body `{ caption, background_color?, caption_color?, font_type? }`. Statut média : `POST /messages/story/media` body `{ media, caption? }` (à confirmer contre la doc Whapi par l'implémenteur de la Task 2).
- Worker idempotent : un statut `posted` n'est jamais republié ; survit à un redéploiement. Une seule instance Railway (invariant déjà documenté).
- Bucket `status-media` : tenant-scopé, pas de listing (leçon advisor 0025), filename sanitisé.
- Migrations DDL via MCP `apply_migration` en prod après vérif locale. Railway pas auto-deploy : redéployer le bot après merge.
- ⚠️ Coordination : une session parallèle construit la phase 4B ; ce plan touche `services/whatsapp/src/index.ts` (câblage worker) et `apps/web/src/app/app/layout.tsx` (lien nav) — conflits triviaux à réconcilier au merge. Migration numérotée `0012` (renuméroter si 4B a pris le même).

## File Structure (cible)

```
supabase/migrations/20260709000012_statuses.sql   # table statuses + RLS + realtime + bucket status-media
packages/db/src/types.ts                          # + StatusKind, StatusRow types
packages/whapi/src/client.ts                      # + postStatusText, postStatusMedia
services/whatsapp/src/
├── config.ts            # + statusPollMs (défaut 30000)
├── statuses/
│   ├── repo.ts          # StatusRepo (claim due, mark posted/failed, getChannel)
│   └── worker.ts        # startStatusWorker (poll + publish)
└── index.ts             # + startStatusWorker
apps/web/src/app/app/statuts/{page.tsx, form.tsx, actions.ts}
packages/whapi/test/story.test.ts
services/whatsapp/test/status-worker.test.ts
```

---

### Task 1: Migration 0012 — table statuses + RLS + bucket

**Files:** Create `supabase/migrations/20260709000012_statuses.sql`

**Interfaces:** Produces `statuses` table + enum `status_state` + realtime + bucket `status-media`.

- [ ] **Step 1: Migration**
```sql
create type status_state as enum ('draft', 'scheduled', 'posting', 'posted', 'failed', 'canceled');

create table statuses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image')),
  content text not null,
  media_url text,
  scheduled_at timestamptz,
  state status_state not null default 'draft',
  posted_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index statuses_worker_idx on statuses (state, scheduled_at);

alter table statuses enable row level security;
create policy tenant_all_statuses on statuses for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

alter publication supabase_realtime add table statuses;

insert into storage.buckets (id, name, public) values ('status-media', 'status-media', true)
on conflict do nothing;
create policy status_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'status-media'
    and ((storage.foldername(name))[1] in (
      select restaurant_id::text from restaurant_members where user_id = auth.uid())
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))));
create policy status_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'status-media'
    and ((storage.foldername(name))[1] in (
      select restaurant_id::text from restaurant_members where user_id = auth.uid())
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))));
```

- [ ] **Step 2** Local verify `supabase db reset && supabase test db` → 0001-0012 apply, pgTAP 26/26 unchanged.
- [ ] **Step 3** Commit `feat(db): table statuses + RLS + realtime + bucket status-media (migration 0012)`. (Do NOT apply to prod — controller does at deploy.)

---

### Task 2: Whapi client — postStatusText / postStatusMedia

**Files:** Modify `packages/whapi/src/client.ts` ; Test `packages/whapi/test/story.test.ts`

**Interfaces:** Produces on `WhapiClient` :
- `postStatusText(caption: string): Promise<{ id?: string }>` — POST `/messages/story/text` body `{ caption }`.
- `postStatusMedia(mediaUrl: string, caption?: string): Promise<{ id?: string }>` — POST `/messages/story/media` body `{ media: mediaUrl, caption }`. (Confirm the media path/param names against Whapi docs; if different, use the doc's exact path.)

- [ ] **Step 1: Test (échoue d'abord)**
```ts
import { describe, expect, it, vi } from 'vitest'
import { WhapiClient } from '../src/client.js'
function mockFetch(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}
describe('WhapiClient stories', () => {
  it('postStatusText → POST /messages/story/text avec caption', async () => {
    const fetchFn = mockFetch(200, { message: { id: 'S1' } })
    const c = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    const res = await c.postStatusText('Promo du jour !')
    expect(res.id).toBe('S1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/story/text')
    expect(JSON.parse(init.body)).toEqual({ caption: 'Promo du jour !' })
  })
  it('postStatusMedia → POST /messages/story/media avec media+caption', async () => {
    const fetchFn = mockFetch(200, { message: { id: 'S2' } })
    const c = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    const res = await c.postStatusMedia('https://x/img.jpg', 'Légende')
    expect(res.id).toBe('S2')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/story/media')
    expect(JSON.parse(init.body)).toEqual({ media: 'https://x/img.jpg', caption: 'Légende' })
  })
})
```
- [ ] **Step 2** FAIL → **Step 3** implémenter (à côté de sendImage) :
```ts
  async postStatusText(caption: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/story/text', { caption })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }
  async postStatusMedia(mediaUrl: string, caption?: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/story/media', { media: mediaUrl, caption })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }
```
- [ ] **Step 4** `pnpm --filter @goutatou/whapi test` PASS (existants + 2 nouveaux) + typecheck. **Step 5** Commit `feat(whapi): publication de statuts WhatsApp (story text/media)`.

---

### Task 3: Types statuts

**Files:** Modify `packages/db/src/types.ts` ; Test `packages/db/test/status-types.test.ts`

**Interfaces:** Produces `type StatusState = 'draft'|'scheduled'|'posting'|'posted'|'failed'|'canceled'` ; `type StatusKind = 'text'|'image'` ; `function statusStateLabel(s: StatusState): string` (FR).

- [ ] **Step 1: Test**
```ts
import { describe, expect, it } from 'vitest'
import { statusStateLabel } from '../src/types.js'
describe('statusStateLabel', () => {
  it('libellés FR', () => {
    expect(statusStateLabel('scheduled')).toBe('Programmé')
    expect(statusStateLabel('posted')).toBe('Publié')
    expect(statusStateLabel('failed')).toBe('Échec')
  })
})
```
- [ ] **Step 2** FAIL → **Step 3** append :
```ts
export type StatusState = 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed' | 'canceled'
export type StatusKind = 'text' | 'image'
const STATUS_LABELS: Record<StatusState, string> = {
  draft: 'Brouillon', scheduled: 'Programmé', posting: 'Publication…', posted: 'Publié', failed: 'Échec', canceled: 'Annulé',
}
export function statusStateLabel(s: StatusState): string { return STATUS_LABELS[s] }
```
- [ ] **Step 4** PASS. **Step 5** Commit `feat(db): types StatusState/StatusKind + statusStateLabel`.

---

### Task 4: StatusRepo + status worker

**Files:** Create `services/whatsapp/src/statuses/repo.ts`, `services/whatsapp/src/statuses/worker.ts` ; Test `services/whatsapp/test/status-worker.test.ts`

**Interfaces:**
- `StatusRepo` : `claimDue(nowIso): Promise<DueStatus[]>` (scheduled échus → posting, retourne les posting), `getChannel(restaurantId): Promise<{token,status}|null>` (déchiffre), `markPosted(id, whapiId)`, `markFailed(id, error)`. `interface DueStatus { id: string; restaurantId: string; kind: 'text'|'image'; content: string; mediaUrl: string | null }`.
- `processStatusOnce(s: DueStatus, deps): Promise<void>` — si canal actif : publie via `postStatusText(content)` (kind text) ou `postStatusMedia(mediaUrl, content)` (kind image) → markPosted ; sinon markFailed. `startStatusWorker(deps & {pollMs})` — poll `claimDue` + processStatusOnce, try/catch/finally (survit aux erreurs).

- [ ] **Step 1: Tests (échouent d'abord)** — mock repo + whapi : un statut texte `posting` → postStatusText appelé + markPosted ; un échec Whapi → markFailed ; canal inactif → markFailed sans publier. (Structure calquée sur `test/campaign-worker.test.ts`.)
- [ ] **Step 2** FAIL → **Step 3** implémenter repo.ts (service-role, `decryptToken`) + worker.ts (mirror campaign worker, sans throttle inter-message — volume faible).
- [ ] **Step 4** `pnpm --filter @goutatou/service-whatsapp test` PASS + typecheck. **Step 5** Commit `feat(bot): status worker — publie les statuts WhatsApp programmés`.

---

### Task 5: Config + câblage worker

**Files:** Modify `services/whatsapp/src/config.ts`, `services/whatsapp/src/index.ts`

- [ ] **Step 1** config : `statusPollMs: Number(process.env.STATUS_POLL_MS ?? 30000)`.
- [ ] **Step 2** index.ts : `createStatusRepo(db, config.tokenKey)` + `startStatusWorker({repo, makeWhapi:(t)=>new WhapiClient(t), pollMs: config.statusPollMs})` après le campaign worker.
- [ ] **Step 3** `pnpm --filter @goutatou/service-whatsapp test && typecheck`. **Step 4** Commit `feat(bot): câble le status worker dans le service`.

---

### Task 6: Web — /app/statuts (compose + programmer + liste)

**Files:** Create `apps/web/src/app/app/statuts/{page.tsx, form.tsx, actions.ts}` ; Modify `apps/web/src/app/app/layout.tsx` (lien nav)

**Interfaces:** Consumes `createSupabaseServer`, `assertPlan(['pro','premium'])` (premium.ts phase 3A), bucket `status-media`, `statusStateLabel`.

- [ ] **Step 1: actions.ts** — `createStatus(formData)` (assertPlan + myRestaurantId ; insert statuses {kind, content, media_url?, scheduled_at, state: action==='now'?'posting':action==='schedule'?'scheduled':'draft'} ; rejette « Programmer » sans date, comme les campagnes) ; `cancelStatus(id)` (state canceled si scheduled/posting) ; `uploadStatusMedia(formData)` (bucket status-media, filename sanitisé). Toutes gated Pro.
- [ ] **Step 2: page.tsx** (server, force-dynamic) — si `!isPro` upsell Pro ; sinon liste des statuts (realtime board client optionnel) + lien composer. **form.tsx** (client) : texte OU image, envoyer/programmer/brouillon.
- [ ] **Step 3** lien nav `<Link href="/app/statuts">Statuts</Link>`.
- [ ] **Step 4** `pnpm --filter @goutatou/web test && typecheck && build` (route présente, pas de crypto client). **Step 5** Commit `feat(web): /app/statuts (composer + programmer statuts WhatsApp) + gating Pro`.

---

### Task 7: Déploiement + smoke test

- [ ] **Step 1** Migration 0012 en prod via MCP `apply_migration` ; vérifier tables/RLS/advisors (pas de listing status-media).
- [ ] **Step 2** Railway : `STATUS_POLL_MS` optionnel (défaut). Redéployer le bot (`railway up --detach --service whatsapp-bot`) ; log `[status-worker] démarré`.
- [ ] **Step 3** `.env.example` + `docs/deploiement.md` : section « Statuts WhatsApp (phase 3B) » (gating Pro, worker, endpoint Whapi story).
- [ ] **Step 4** Smoke test (resto Pro, canal connecté) : `/app/statuts` → composer un statut texte → « Envoyer maintenant » → vérifier la publication sur le statut WhatsApp du canal ; programmer un statut → publié à l'heure.
- [ ] **Step 5** Commit `docs: déploiement phase 3B (status worker, endpoint story)`.

---

## Self-Review (fait à la rédaction)

- **Couverture spec 3B** : table statuses+RLS+bucket (T1), client Whapi story (T2), types (T3), repo+worker (T4), câblage (T5), UI gated Pro (T6), déploiement (T7). Mirror du pattern campagnes (4A) éprouvé.
- **Placeholders** : T4/T6 décrivent repo/worker/UI en référençant le pattern campagnes (4A, en repo) ; migration, client Whapi et types portent le code complet.
- **Cohérence** : `StatusState`/`StatusKind` (T3) consommés par worker (T4) et UI (T6) ; `postStatusText`/`postStatusMedia` (T2) appelés par le worker (T4) ; `assertPlan(['pro','premium'])` (phase 3A) réutilisé.
- **Risque externe** : l'endpoint média `/messages/story/media` est à confirmer contre la doc Whapi (le texte `/messages/story/text` est confirmé) ; le smoke test réel dépend d'un canal connecté (comme toutes les phases).
```
