# Goutatou Phase 4A (Campagnes WhatsApp broadcast) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux restaurants premium d'envoyer des campagnes WhatsApp broadcast à leurs clients opt-in, avec un worker d'envoi rate-limité anti-ban sur le service Railway, gestion de l'opt-out par mot-clé, et une UI de composition/suivi temps réel.

**Architecture:** Les campagnes sont créées dans `apps/web` (`/app/campagnes`, gating premium). Le service bot Railway (`services/whatsapp`) héberge un **campaign worker** : il poll les campagnes `scheduled` échues → `sending`, snapshot l'audience (clients `opted_out = false`) dans `campaign_recipients`, puis dépile les destinataires `pending` avec un délai + jitter entre chaque envoi Whapi (anti-ban) et un cap journalier par resto. L'opt-out (mot-clé STOP) est géré dans le processor du bot. Tout est service-role côté worker ; RLS tenant côté web.

**Tech Stack:** monorepo pnpm existant · TypeScript strict · services/whatsapp (Express/tsx, Node 22, Railway) · Supabase (Postgres + RLS + Realtime + Storage) · Next.js 15 (Netlify) · Vitest.

## Global Constraints

- Textes FR ; TypeScript `"strict": true`.
- Worker et web actions serveur uniquement (service-role via `createServiceClient` / `createAdminClient`) ; jamais côté client. Composants client importent uniquement `@goutatou/db/types`.
- Anti-ban : délai configurable + jitter entre CHAQUE envoi (défaut 4000-8000 ms) ; cap journalier par resto (défaut 500) ; une seule campagne `sending` par resto à la fois ; les `opted_out = true` sont TOUJOURS exclus.
- Gating premium : création/envoi de campagne réservés aux restos `subscriptions.plan = 'premium'` (vérifié côté serveur, pas seulement UI).
- Worker idempotent : un destinataire `sent` n'est jamais renvoyé ; survit à un redéploiement.
- Migrations DDL via `apply_migration` (MCP) en prod, après vérif locale `supabase db reset && supabase test db` (21 pgTAP existants restent verts).
- Storage `campaign-media` : bucket public tenant-scopé, écriture par préfixe dossier = restaurant_id, PAS de policy select (leçon advisor 0025), filename sanitisé.
- Commits fréquents, préfixes `feat:`/`fix:`/`test:`/`chore:`/`docs:`.

## File Structure (cible)

```
supabase/migrations/20260709000008_campaigns.sql        # tables + RLS + realtime + bucket campaign-media
packages/db/src/types.ts                                # + types Campaign/CampaignStatus/RecipientStatus
services/whatsapp/src/
├── config.ts                                           # + campaignPollMs, sendDelayMinMs/MaxMs, dailyCap
├── campaigns/
│   ├── optout.ts        # isOptOutKeyword (pur, testé)
│   ├── throttle.ts      # nextSendDelayMs (pur, testé)
│   ├── repo.ts          # CampaignRepo (accès DB campagnes, service-role)
│   └── worker.ts        # startCampaignWorker (poll + snapshot + envoi throttlé)
├── processor.ts         # + branche opt-out avant transition
├── repo.ts              # + setOptedOut(restaurantId, customerId)
└── index.ts             # + startCampaignWorker(...)
apps/web/src/
├── lib/campaigns.ts     # helpers purs (compte destinataires n/a; statut UI) — testés
├── lib/premium.ts       # assertPremium / isPremium (server-only)
└── app/app/campagnes/
    ├── page.tsx         # liste (server) + gating premium
    ├── board.tsx        # realtime (client)
    ├── nouvelle/{page.tsx, form.tsx}   # composer
    ├── [id]/{page.tsx, detail.tsx}     # suivi + annulation
    └── actions.ts       # createCampaign / scheduleCampaign / sendNow / cancelCampaign / uploadMedia
services/whatsapp/test/{optout.test.ts, throttle.test.ts, campaign-worker.test.ts, processor-optout.test.ts}
apps/web/test/campaigns.test.ts
```

---

### Task 1: Migration 0008 — tables campagnes + RLS + realtime + bucket

**Files:**
- Create: `supabase/migrations/20260709000008_campaigns.sql`

**Interfaces:**
- Produces: tables `campaigns`, `campaign_recipients` ; enums `campaign_status`, `recipient_status` ; bucket `campaign-media` (policies tenant-scopées) ; `campaigns` dans la publication realtime. Consommés par toutes les tâches suivantes.

- [ ] **Step 1: Écrire la migration**

`supabase/migrations/20260709000008_campaigns.sql` :
```sql
create type campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'canceled');
create type recipient_status as enum ('pending', 'sent', 'failed');

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  body text not null,
  media_url text,
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index campaigns_worker_idx on campaigns (status, scheduled_at);

create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status recipient_status not null default 'pending',
  error text,
  sent_at timestamptz,
  unique (campaign_id, customer_id)
);
create index campaign_recipients_pending_idx on campaign_recipients (campaign_id, status);

alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;

create policy tenant_all_campaigns on campaigns for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_camp_recipients on campaign_recipients for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- Realtime : le dashboard suit la progression des campagnes
alter publication supabase_realtime add table campaigns;

-- Storage : médias de campagne, tenant-scopé, sans listing public
insert into storage.buckets (id, name, public) values ('campaign-media', 'campaign-media', true)
on conflict do nothing;

create policy campaign_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );
create policy campaign_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );
```

- [ ] **Step 2: Vérifier en local**

Run: `supabase db reset && supabase test db`
Expected: migrations 0001→0008 s'appliquent, pgTAP 21/21 inchangés.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260709000008_campaigns.sql
git commit -m "feat(db): tables campaigns + campaign_recipients, RLS, realtime, bucket campaign-media (migration 0008)"
```

> Note : l'application en prod (via MCP `apply_migration`) se fait en Task 10 (déploiement).

---

### Task 2: Types partagés campagnes

**Files:**
- Modify: `packages/db/src/types.ts`
- Test: `packages/db/test/campaign-types.test.ts`

**Interfaces:**
- Produces (`@goutatou/db/types`) :
  - `type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled'`
  - `type RecipientStatus = 'pending' | 'sent' | 'failed'`
  - `interface CampaignProgress { total: number; sent: number; failed: number; pending: number }`
  - `campaignProgress(total: number, sent: number, failed: number): CampaignProgress` (pending = max(0, total - sent - failed)).

- [ ] **Step 1: Test (échoue d'abord)**

`packages/db/test/campaign-types.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { campaignProgress } from '../src/types.js'

describe('campaignProgress', () => {
  it('calcule pending = total - sent - failed', () => {
    expect(campaignProgress(100, 30, 5)).toEqual({ total: 100, sent: 30, failed: 5, pending: 65 })
  })
  it('pending ne descend jamais sous 0', () => {
    expect(campaignProgress(10, 8, 5).pending).toBe(0)
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/db test -- campaign-types` — Expected: FAIL.

- [ ] **Step 3: Ajouter à `packages/db/src/types.ts`** (à la fin) :
```ts
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled'
export type RecipientStatus = 'pending' | 'sent' | 'failed'

export interface CampaignProgress {
  total: number
  sent: number
  failed: number
  pending: number
}

export function campaignProgress(total: number, sent: number, failed: number): CampaignProgress {
  return { total, sent, failed, pending: Math.max(0, total - sent - failed) }
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/db test` — Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): types CampaignStatus/RecipientStatus + campaignProgress"
```

---

### Task 3: Opt-out — détecteur de mot-clé (pur, testé)

**Files:**
- Create: `services/whatsapp/src/campaigns/optout.ts`
- Test: `services/whatsapp/test/optout.test.ts`

**Interfaces:**
- Produces: `isOptOutKeyword(input: string): boolean` — true si le message (trim/lowercase, accents ignorés) est exactement un mot-clé d'opt-out : `stop`, `stopper`, `desabonner`, `désabonner`, `unsubscribe`. Consommé par le processor (Task 4).

- [ ] **Step 1: Test (échoue d'abord)**

`services/whatsapp/test/optout.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { isOptOutKeyword } from '../src/campaigns/optout.js'

describe('isOptOutKeyword', () => {
  it('reconnaît les variantes FR/EN', () => {
    for (const k of ['STOP', 'stop', ' Stop ', 'Stopper', 'désabonner', 'desabonner', 'UNSUBSCRIBE']) {
      expect(isOptOutKeyword(k)).toBe(true)
    }
  })
  it('ne déclenche pas sur du texte normal', () => {
    for (const k of ['menu', 'je veux commander', 'stop bus', 'arrete']) {
      expect(isOptOutKeyword(k)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- optout` — FAIL.

- [ ] **Step 3: Implémenter**

`services/whatsapp/src/campaigns/optout.ts` :
```ts
const KEYWORDS = new Set(['stop', 'stopper', 'desabonner', 'unsubscribe'])

export function isOptOutKeyword(input: string): boolean {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents (désabonner -> desabonner)
  return KEYWORDS.has(normalized)
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test -- optout` — PASS.

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp/src/campaigns/optout.ts services/whatsapp/test/optout.test.ts
git commit -m "feat(bot): détecteur de mot-clé opt-out (STOP/désabonner)"
```

---

### Task 4: Opt-out — repo.setOptedOut + branchement processor

**Files:**
- Modify: `services/whatsapp/src/repo.ts`, `services/whatsapp/src/processor.ts`
- Test: `services/whatsapp/test/processor-optout.test.ts`

**Interfaces:**
- Consumes: `isOptOutKeyword` (Task 3), `BotRepo` (phase 1).
- Produces: `BotRepo.setOptedOut(restaurantId: string, customerId: string): Promise<void>`. Le processor, après `upsertCustomer` et le log entrant, si `isOptOutKeyword(body)` : appelle `setOptedOut`, envoie une confirmation FR, et **skip** la machine à états (pas de `transition`).

- [ ] **Step 1: Test (échoue d'abord)**

`services/whatsapp/test/processor-optout.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

function payload(body: string) {
  return {
    messages: [{ id: 'M-' + body, from_me: false, type: 'text', chat_id: '24177000001@s.whatsapp.net',
      from: '24177000001', from_name: 'Client', text: { body } }],
    channel_id: 'CH',
  }
}

describe('processor opt-out', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({ channelUuid: 'c', restaurantId: 'r1', restaurantName: 'X', token: 't', driveEnabled: true }),
      getBotContext: vi.fn().mockResolvedValue({ restaurantName: 'X', driveEnabled: true, driveSlots: [], menu: { categories: [] } }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('mot-clé STOP → setOptedOut + confirmation, pas de transition', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('c', payload('STOP'))
    expect(repo.setOptedOut).toHaveBeenCalledWith('r1', 'cust1')
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('désabonné'))
    expect(repo.loadConversation).not.toHaveBeenCalled()
  })

  it('message normal → pas de setOptedOut', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('c', payload('menu'))
    expect(repo.setOptedOut).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- processor-optout` — FAIL.

- [ ] **Step 3: Ajouter `setOptedOut` au repo**

Dans `services/whatsapp/src/repo.ts`, ajouter à l'interface `BotRepo` :
```ts
  setOptedOut(restaurantId: string, customerId: string): Promise<void>
```
et à l'implémentation `createRepo` (à côté de `upsertCustomer`) :
```ts
    async setOptedOut(restaurantId, customerId) {
      const { error } = await db.from('customers').update({ opted_out: true })
        .eq('restaurant_id', restaurantId).eq('id', customerId)
      if (error) throw new Error(`setOptedOut: ${error.message}`)
    },
```

- [ ] **Step 4: Brancher dans le processor**

Dans `services/whatsapp/src/processor.ts`, importer en tête :
```ts
import { isOptOutKeyword } from './campaigns/optout.js'
```
Dans la boucle de traitement, APRÈS `const customer = await repo.upsertCustomer(...)` et AVANT `const conv = await repo.loadConversation(...)`, insérer :
```ts
        if (isOptOutKeyword(msg.text.body)) {
          await repo.setOptedOut(channel.restaurantId, customer.id)
          const bye = 'Vous êtes désabonné(e) des messages de ce restaurant. Tapez *menu* pour commander à nouveau quand vous voulez. 👋'
          try {
            const sent = await whapi.sendText(msg.chat_id, bye)
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, bye, sent.id)
          } catch (err) {
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, bye, undefined, String(err))
          }
          continue
        }
```
(Note : « désabonné » doit apparaître dans le message pour satisfaire le test.)

- [ ] **Step 5: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test` — Expected: opt-out + tous les tests existants PASS.

- [ ] **Step 6: Commit**

```bash
git add services/whatsapp/src/repo.ts services/whatsapp/src/processor.ts services/whatsapp/test/processor-optout.test.ts
git commit -m "feat(bot): opt-out par mot-clé — setOptedOut + branchement processor"
```

---

### Task 5: Throttle anti-ban (pur, testé)

**Files:**
- Create: `services/whatsapp/src/campaigns/throttle.ts`
- Test: `services/whatsapp/test/throttle.test.ts`

**Interfaces:**
- Produces: `nextSendDelayMs(minMs: number, maxMs: number, rng?: () => number): number` — délai borné `[minMs, maxMs]`, `rng` injectable (défaut `Math.random`) pour les tests. Consommé par le worker (Task 7).

- [ ] **Step 1: Test (échoue d'abord)**

`services/whatsapp/test/throttle.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { nextSendDelayMs } from '../src/campaigns/throttle.js'

describe('nextSendDelayMs', () => {
  it('reste dans les bornes', () => {
    expect(nextSendDelayMs(4000, 8000, () => 0)).toBe(4000)
    expect(nextSendDelayMs(4000, 8000, () => 0.999999)).toBeLessThanOrEqual(8000)
    expect(nextSendDelayMs(4000, 8000, () => 0.5)).toBe(6000)
  })
  it('borne inférieure si min >= max', () => {
    expect(nextSendDelayMs(5000, 5000, () => 0.7)).toBe(5000)
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- throttle` — FAIL.

- [ ] **Step 3: Implémenter**

`services/whatsapp/src/campaigns/throttle.ts` :
```ts
export function nextSendDelayMs(minMs: number, maxMs: number, rng: () => number = Math.random): number {
  if (maxMs <= minMs) return minMs
  return Math.round(minMs + rng() * (maxMs - minMs))
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test -- throttle` — PASS.

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp/src/campaigns/throttle.ts services/whatsapp/test/throttle.test.ts
git commit -m "feat(bot): throttle anti-ban (délai + jitter borné, rng injectable)"
```

---

### Task 6: CampaignRepo — accès DB des campagnes (service-role)

**Files:**
- Create: `services/whatsapp/src/campaigns/repo.ts`

**Interfaces:**
- Consumes: `SupabaseClient`, `decryptToken` (`@goutatou/db`).
- Produces (consommé par le worker Task 7) :
  - `interface DueCampaign { id: string; restaurantId: string; body: string; mediaUrl: string | null }`
  - `interface PendingRecipient { recipientId: string; chatId: string }`
  - `interface CampaignChannel { token: string; status: string }`
  - `interface CampaignRepo {`
    - `claimScheduledDue(nowIso: string): Promise<DueCampaign[]>` — passe les campagnes `scheduled` échues (`scheduled_at <= now`) en `sending` + `started_at`, retourne celles passées en `sending` (y compris déjà `sending` non finies).
    - `snapshotRecipients(campaignId: string, restaurantId: string): Promise<number>` — insère (idempotent, `on conflict do nothing`) un `campaign_recipients pending` par client `opted_out = false` du resto ; met à jour `campaigns.total_recipients` ; retourne le total.
    - `nextPendingBatch(campaignId: string, limit: number): Promise<PendingRecipient[]>` — jointure avec `customers.chat_id`.
    - `getChannel(restaurantId: string): Promise<CampaignChannel | null>` (token déchiffré).
    - `markRecipient(recipientId: string, restaurantId: string, ok: boolean, error?: string): Promise<void>` + incrément atomique `sent_count`/`failed_count` via RPC ou update.
    - `sentTodayCount(restaurantId: string): Promise<number>` — nb de `campaign_recipients sent` avec `sent_at >= début du jour`.
    - `finalizeIfDone(campaignId: string): Promise<void>` — si plus aucun `pending`, passe la campagne `sent` + `finished_at`.
    - `isCanceled(campaignId: string): Promise<boolean>`.
  - `createCampaignRepo(db: SupabaseClient, tokenKey: string): CampaignRepo`

- [ ] **Step 1: Migration helper — RPC d'incrément atomique des compteurs**

Ajouter à la fin de `supabase/migrations/20260709000008_campaigns.sql` (Task 1 — si déjà commitée, créer `supabase/migrations/20260709000009_campaign_counters.sql` avec ce contenu) :
```sql
create or replace function bump_campaign_counter(p_campaign_id uuid, p_sent int, p_failed int)
returns void language sql security definer set search_path = public as $$
  update campaigns
    set sent_count = sent_count + p_sent,
        failed_count = failed_count + p_failed
  where id = p_campaign_id;
$$;
revoke execute on function bump_campaign_counter(uuid, int, int) from public, anon, authenticated;
grant execute on function bump_campaign_counter(uuid, int, int) to service_role;
```
Vérifier `supabase db reset && supabase test db` (21/21).

- [ ] **Step 2: Implémenter le repo**

`services/whatsapp/src/campaigns/repo.ts` :
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueCampaign { id: string; restaurantId: string; body: string; mediaUrl: string | null }
export interface PendingRecipient { recipientId: string; chatId: string }
export interface CampaignChannel { token: string; status: string }

export interface CampaignRepo {
  claimScheduledDue(nowIso: string): Promise<DueCampaign[]>
  snapshotRecipients(campaignId: string, restaurantId: string): Promise<number>
  nextPendingBatch(campaignId: string, limit: number): Promise<PendingRecipient[]>
  getChannel(restaurantId: string): Promise<CampaignChannel | null>
  markRecipient(recipientId: string, campaignId: string, ok: boolean, error?: string): Promise<void>
  sentTodayCount(restaurantId: string): Promise<number>
  finalizeIfDone(campaignId: string): Promise<void>
  isCanceled(campaignId: string): Promise<boolean>
}

export function createCampaignRepo(db: SupabaseClient, tokenKey: string): CampaignRepo {
  return {
    async claimScheduledDue(nowIso) {
      // Passe les 'scheduled' échues en 'sending'
      await db.from('campaigns').update({ status: 'sending', started_at: nowIso })
        .eq('status', 'scheduled').lte('scheduled_at', nowIso)
      const { data } = await db.from('campaigns')
        .select('id, restaurant_id, body, media_url').eq('status', 'sending')
      return (data ?? []).map((c) => ({ id: c.id, restaurantId: c.restaurant_id, body: c.body, mediaUrl: c.media_url }))
    },
    async snapshotRecipients(campaignId, restaurantId) {
      const { data: custs } = await db.from('customers').select('id')
        .eq('restaurant_id', restaurantId).eq('opted_out', false)
      const rows = (custs ?? []).map((c) => ({
        campaign_id: campaignId, restaurant_id: restaurantId, customer_id: c.id, status: 'pending',
      }))
      if (rows.length) await db.from('campaign_recipients').upsert(rows, { onConflict: 'campaign_id,customer_id', ignoreDuplicates: true })
      const total = rows.length
      await db.from('campaigns').update({ total_recipients: total }).eq('id', campaignId)
      return total
    },
    async nextPendingBatch(campaignId, limit) {
      const { data } = await db.from('campaign_recipients')
        .select('id, customers(chat_id)').eq('campaign_id', campaignId).eq('status', 'pending').limit(limit)
      return (data ?? []).map((r) => ({
        recipientId: r.id, chatId: (r.customers as unknown as { chat_id: string }).chat_id,
      }))
    },
    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },
    async markRecipient(recipientId, campaignId, ok, error) {
      await db.from('campaign_recipients').update({
        status: ok ? 'sent' : 'failed', sent_at: ok ? new Date().toISOString() : null, error: error ?? null,
      }).eq('id', recipientId)
      await db.rpc('bump_campaign_counter', { p_campaign_id: campaignId, p_sent: ok ? 1 : 0, p_failed: ok ? 0 : 1 })
    },
    async sentTodayCount(restaurantId) {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { count } = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId).eq('status', 'sent').gte('sent_at', start.toISOString())
      return count ?? 0
    },
    async finalizeIfDone(campaignId) {
      const { count } = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'pending')
      if ((count ?? 0) === 0) {
        await db.from('campaigns').update({ status: 'sent', finished_at: new Date().toISOString() })
          .eq('id', campaignId).eq('status', 'sending')
      }
    },
    async isCanceled(campaignId) {
      const { data } = await db.from('campaigns').select('status').eq('id', campaignId).single()
      return data?.status === 'canceled'
    },
  }
}
```

Note : `new Date()` est utilisé dans le repo (runtime réel, pas un test déterministe) — acceptable ici (le worker tourne en prod), contrairement aux scripts de workflow.

- [ ] **Step 3: Vérifier** — `pnpm --filter @goutatou/service-whatsapp typecheck` clean.

- [ ] **Step 4: Commit**

```bash
git add services/whatsapp/src/campaigns/repo.ts supabase/migrations/20260709000009_campaign_counters.sql
git commit -m "feat(bot): CampaignRepo (claim, snapshot, batch, mark, cap journalier) + RPC bump_campaign_counter"
```

---

### Task 7: Campaign worker — boucle d'envoi throttlée

**Files:**
- Create: `services/whatsapp/src/campaigns/worker.ts`
- Test: `services/whatsapp/test/campaign-worker.test.ts`

**Interfaces:**
- Consumes: `CampaignRepo` (Task 6), `nextSendDelayMs` (Task 5), `WhapiClient.sendText`/`sendImage` (`@goutatou/whapi`).
- Produces:
  - `interface WorkerDeps { repo: CampaignRepo; makeWhapi: (token: string) => Pick<WhapiClient, 'sendText' | 'sendImage'>; sleep: (ms: number) => Promise<void>; rng?: () => number; dailyCap: number; sendDelayMinMs: number; sendDelayMaxMs: number; batchSize: number }`
  - `processCampaignOnce(campaign: DueCampaign, deps: WorkerDeps): Promise<void>` — traite un lot de destinataires d'une campagne `sending` : vérifie annulation + cap journalier, envoie chaque destinataire (throttlé), marque le résultat, finalise si terminé. Testable (deps injectées).
  - `startCampaignWorker(deps: WorkerDeps & { pollMs: number }): void` — boucle : `claimScheduledDue` + `snapshotRecipients` (si total 0) + `processCampaignOnce` pour chaque, toutes les `pollMs`.

- [ ] **Step 1: Tests (échouent d'abord)**

`services/whatsapp/test/campaign-worker.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest'
import { processCampaignOnce, type WorkerDeps } from '../src/campaigns/worker.js'
import type { CampaignRepo, DueCampaign } from '../src/campaigns/repo.js'

const campaign: DueCampaign = { id: 'camp1', restaurantId: 'r1', body: 'Promo -20% ce weekend !', mediaUrl: null }

function makeDeps(over: Partial<WorkerDeps> = {}): { deps: WorkerDeps; sendText: ReturnType<typeof vi.fn>; repo: CampaignRepo } {
  const sendText = vi.fn().mockResolvedValue({ id: 'X' })
  const repo: CampaignRepo = {
    claimScheduledDue: vi.fn(), snapshotRecipients: vi.fn(),
    nextPendingBatch: vi.fn()
      .mockResolvedValueOnce([{ recipientId: 'a', chatId: '1@s.whatsapp.net' }, { recipientId: 'b', chatId: '2@s.whatsapp.net' }])
      .mockResolvedValue([]),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markRecipient: vi.fn().mockResolvedValue(undefined),
    sentTodayCount: vi.fn().mockResolvedValue(0),
    finalizeIfDone: vi.fn().mockResolvedValue(undefined),
    isCanceled: vi.fn().mockResolvedValue(false),
  }
  const deps: WorkerDeps = {
    repo, makeWhapi: () => ({ sendText, sendImage: vi.fn() }), sleep: vi.fn().mockResolvedValue(undefined),
    rng: () => 0, dailyCap: 500, sendDelayMinMs: 4000, sendDelayMaxMs: 8000, batchSize: 50, ...over,
  }
  return { deps, sendText, repo }
}

describe('processCampaignOnce', () => {
  it('envoie chaque destinataire du lot, throttlé, et marque sent', async () => {
    const { deps, sendText, repo } = makeDeps()
    await processCampaignOnce(campaign, deps)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenCalledWith('1@s.whatsapp.net', 'Promo -20% ce weekend !')
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', true, undefined)
    expect(deps.sleep).toHaveBeenCalled() // throttle entre envois
    expect(repo.finalizeIfDone).toHaveBeenCalledWith('camp1')
  })

  it('un échec Whapi marque failed sans stopper le lot', async () => {
    const { deps, sendText, repo } = makeDeps()
    sendText.mockRejectedValueOnce(new Error('whapi 500'))
    await processCampaignOnce(campaign, deps)
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', false, expect.stringContaining('whapi'))
    expect(repo.markRecipient).toHaveBeenCalledWith('b', 'camp1', true, undefined)
  })

  it('campagne annulée → ne rien envoyer', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.isCanceled = vi.fn().mockResolvedValue(true)
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('cap journalier atteint → ne rien envoyer ce tour', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.sentTodayCount = vi.fn().mockResolvedValue(500)
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inactif → ne rien envoyer', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- campaign-worker` — FAIL.

- [ ] **Step 3: Implémenter**

`services/whatsapp/src/campaigns/worker.ts` :
```ts
import type { WhapiClient } from '@goutatou/whapi'
import { nextSendDelayMs } from './throttle.js'
import type { CampaignRepo, DueCampaign } from './repo.js'

export interface WorkerDeps {
  repo: CampaignRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText' | 'sendImage'>
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  dailyCap: number
  sendDelayMinMs: number
  sendDelayMaxMs: number
  batchSize: number
}

export async function processCampaignOnce(campaign: DueCampaign, deps: WorkerDeps): Promise<void> {
  if (await deps.repo.isCanceled(campaign.id)) return
  if ((await deps.repo.sentTodayCount(campaign.restaurantId)) >= deps.dailyCap) return

  const channel = await deps.repo.getChannel(campaign.restaurantId)
  if (!channel || channel.status !== 'active') return
  const whapi = deps.makeWhapi(channel.token)

  const batch = await deps.repo.nextPendingBatch(campaign.id, deps.batchSize)
  for (const r of batch) {
    if (await deps.repo.isCanceled(campaign.id)) return
    try {
      if (campaign.mediaUrl) await whapi.sendImage(r.chatId, campaign.mediaUrl, campaign.body)
      else await whapi.sendText(r.chatId, campaign.body)
      await deps.repo.markRecipient(r.recipientId, campaign.id, true, undefined)
    } catch (err) {
      await deps.repo.markRecipient(r.recipientId, campaign.id, false, String(err))
    }
    await deps.sleep(nextSendDelayMs(deps.sendDelayMinMs, deps.sendDelayMaxMs, deps.rng))
  }
  await deps.repo.finalizeIfDone(campaign.id)
}

export function startCampaignWorker(deps: WorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimScheduledDue(new Date().toISOString())
      for (const c of due) {
        // snapshot idempotent si pas encore fait
        await deps.repo.snapshotRecipients(c.id, c.restaurantId)
        await processCampaignOnce(c, deps)
      }
    } catch (err) {
      console.error('[campaign-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[campaign-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
```

Note : `snapshotRecipients` est idempotent (`on conflict do nothing`) ; le rappeler à chaque tick est sûr mais ré-update `total_recipients` — acceptable (petite requête). Optionnel : ne snapshot que si `total_recipients === 0` (optimisation, pas requise).

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test -- campaign-worker` — 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp/src/campaigns/worker.ts services/whatsapp/test/campaign-worker.test.ts
git commit -m "feat(bot): campaign worker — envoi throttlé, cap, annulation, finalisation"
```

---

### Task 8: Config + câblage du worker dans le service

**Files:**
- Modify: `services/whatsapp/src/config.ts`, `services/whatsapp/src/index.ts`
- Test: `services/whatsapp/test/app.test.ts` (inchangé — vérifie juste que le service démarre toujours)

**Interfaces:**
- Consumes: `createCampaignRepo` (Task 6), `startCampaignWorker` (Task 7), `loadConfig` (phase 1).
- Produces: `Config` gagne `campaignPollMs`, `sendDelayMinMs`, `sendDelayMaxMs`, `dailyCap`, `batchSize` (avec défauts). Le worker est démarré dans `index.ts`.

- [ ] **Step 1: Étendre la config**

Dans `services/whatsapp/src/config.ts`, dans l'objet retourné par `loadConfig()`, ajouter :
```ts
    campaignPollMs: Number(process.env.CAMPAIGN_POLL_MS ?? 15000),
    sendDelayMinMs: Number(process.env.CAMPAIGN_SEND_DELAY_MIN_MS ?? 4000),
    sendDelayMaxMs: Number(process.env.CAMPAIGN_SEND_DELAY_MAX_MS ?? 8000),
    dailyCap: Number(process.env.CAMPAIGN_DAILY_CAP ?? 500),
    batchSize: Number(process.env.CAMPAIGN_BATCH_SIZE ?? 50),
```

- [ ] **Step 2: Câbler dans `index.ts`**

Ajouter les imports :
```ts
import { WhapiClient } from '@goutatou/whapi'
import { createCampaignRepo } from './campaigns/repo.js'
import { startCampaignWorker } from './campaigns/worker.js'
```
Après `startNotifier(db, config.tokenKey)` :
```ts
const campaignRepo = createCampaignRepo(db, config.tokenKey)
startCampaignWorker({
  repo: campaignRepo,
  makeWhapi: (token) => new WhapiClient(token),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  dailyCap: config.dailyCap,
  sendDelayMinMs: config.sendDelayMinMs,
  sendDelayMaxMs: config.sendDelayMaxMs,
  batchSize: config.batchSize,
  pollMs: config.campaignPollMs,
})
```

- [ ] **Step 3: Vérifier** — Run: `pnpm --filter @goutatou/service-whatsapp test && pnpm --filter @goutatou/service-whatsapp typecheck` — tous PASS, clean.

- [ ] **Step 4: Commit**

```bash
git add services/whatsapp/src/config.ts services/whatsapp/src/index.ts
git commit -m "feat(bot): câble le campaign worker (config poll/délais/cap) dans le service"
```

---

### Task 9: Web — gating premium + UI /app/campagnes (liste, composer, détail)

**Files:**
- Create: `apps/web/src/lib/premium.ts`, `apps/web/src/app/app/campagnes/{page.tsx, board.tsx, actions.ts}`, `apps/web/src/app/app/campagnes/nouvelle/{page.tsx, form.tsx}`, `apps/web/src/app/app/campagnes/[id]/{page.tsx, detail.tsx}`
- Modify: `apps/web/src/app/app/layout.tsx` (lien « Campagnes »)
- Test: `apps/web/test/campaigns.test.ts` (helper pur de statut)

**Interfaces:**
- Consumes: `createSupabaseServer` (RLS), `createAdminClient` (upsert campagne — service-role pour bypass RLS d'écriture contrôlée), `campaignProgress`/`CampaignStatus` (`@goutatou/db/types`), bucket `campaign-media`.
- Produces:
  - `apps/web/src/lib/premium.ts` (server-only) : `isPremium(supabase, restaurantId): Promise<boolean>` (lit `subscriptions.plan`), `assertPremium(supabase, restaurantId): Promise<void>` (throw si non-premium).
  - `apps/web/src/lib/campaigns.ts` : `statusLabel(s: CampaignStatus): string` (FR), `canCancel(s: CampaignStatus): boolean` (`scheduled`|`sending`).
  - Server actions : `createCampaign(formData)` (draft ou scheduled ou envoi immédiat selon le bouton), `cancelCampaign(id)`, `uploadCampaignMedia(formData)`. Toutes : `assertPremium` + resto du membre (comme phase 1 `myRestaurantId`).

- [ ] **Step 1: Helper de statut (test d'abord)**

`apps/web/src/lib/campaigns.ts` :
```ts
import type { CampaignStatus } from '@goutatou/db/types'

const LABELS: Record<CampaignStatus, string> = {
  draft: 'Brouillon', scheduled: 'Programmée', sending: 'Envoi en cours', sent: 'Envoyée', canceled: 'Annulée',
}
export function statusLabel(s: CampaignStatus): string { return LABELS[s] }
export function canCancel(s: CampaignStatus): boolean { return s === 'scheduled' || s === 'sending' }
```

`apps/web/test/campaigns.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { canCancel, statusLabel } from '../src/lib/campaigns'

describe('campaigns helpers', () => {
  it('statusLabel FR pour chaque statut', () => {
    expect(statusLabel('draft')).toBe('Brouillon')
    expect(statusLabel('sending')).toBe('Envoi en cours')
    expect(statusLabel('sent')).toBe('Envoyée')
  })
  it('canCancel seulement scheduled/sending', () => {
    expect(canCancel('scheduled')).toBe(true)
    expect(canCancel('sending')).toBe(true)
    expect(canCancel('draft')).toBe(false)
    expect(canCancel('sent')).toBe(false)
  })
})
```
Run: `pnpm --filter @goutatou/web test -- campaigns` — d'abord FAIL (helper absent) puis PASS.

- [ ] **Step 2: premium.ts**

`apps/web/src/lib/premium.ts` :
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function isPremium(supabase: SupabaseClient, restaurantId: string): Promise<boolean> {
  const { data } = await supabase.from('subscriptions').select('plan').eq('restaurant_id', restaurantId).maybeSingle()
  return data?.plan === 'premium'
}

export async function assertPremium(supabase: SupabaseClient, restaurantId: string): Promise<void> {
  if (!(await isPremium(supabase, restaurantId))) {
    throw new Error('Fonctionnalité réservée au plan Premium.')
  }
}
```

- [ ] **Step 3: actions.ts**

`apps/web/src/app/app/campagnes/actions.ts` :
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPremium } from '@/lib/premium'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return { supabase, restaurantId: data.restaurant_id as string }
}

export async function createCampaign(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const action = String(formData.get('action')) // 'draft' | 'schedule' | 'now'
  const scheduledAtRaw = String(formData.get('scheduled_at') ?? '')
  const status = action === 'now' ? 'sending' : action === 'schedule' ? 'scheduled' : 'draft'
  const { data, error } = await supabase.from('campaigns').insert({
    restaurant_id: restaurantId,
    name: String(formData.get('name')),
    body: String(formData.get('body')),
    media_url: String(formData.get('media_url') ?? '') || null,
    status,
    scheduled_at: action === 'schedule' && scheduledAtRaw ? new Date(scheduledAtRaw).toISOString()
      : action === 'now' ? new Date().toISOString() : null,
    started_at: action === 'now' ? new Date().toISOString() : null,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Création impossible')
  revalidatePath('/app/campagnes')
  redirect(`/app/campagnes/${data.id}`)
}

export async function cancelCampaign(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const { error } = await supabase.from('campaigns').update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', id).in('status', ['scheduled', 'sending'])
  if (error) throw new Error(error.message)
  revalidatePath(`/app/campagnes/${id}`)
  revalidatePath('/app/campagnes')
}

export async function uploadCampaignMedia(formData: FormData): Promise<string> {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const file = formData.get('media') as File | null
  if (!file || file.size === 0) throw new Error('Aucun fichier')
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('campaign-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('campaign-media').getPublicUrl(path).data.publicUrl
}
```

Note : la création `status='sending'` avec `started_at` déclenche le worker (qui snapshot puis envoie) au prochain tick. Pour `scheduled`, le worker le passe en `sending` à l'échéance.

- [ ] **Step 4: page.tsx (liste) + board.tsx (realtime) + gating**

`apps/web/src/app/app/campagnes/page.tsx` :
```tsx
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isPremium } from '@/lib/premium'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CampagnesPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const premium = member ? await isPremium(supabase, member.restaurant_id) : false
  if (!premium) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold">Campagnes WhatsApp</h1>
        <p className="mt-4 opacity-70">Cette fonctionnalité est réservée au plan <strong>Premium</strong>. Contactez Goutatou pour l’activer.</p>
      </div>
    )
  }
  const { data: campaigns } = await supabase.from('campaigns')
    .select('id, name, status, total_recipients, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
  return <Board initial={campaigns ?? []} />
}
```

`apps/web/src/app/app/campagnes/board.tsx` :
```tsx
'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { statusLabel } from '@/lib/campaigns'
import type { CampaignStatus } from '@goutatou/db/types'

interface Row { id: string; name: string; status: CampaignStatus; total_recipients: number; sent_count: number; failed_count: number }

export function Board({ initial }: { initial: Row[] }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel('campaigns').on('postgres_changes',
      { event: '*', schema: 'public', table: 'campaigns' }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [router])
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campagnes WhatsApp</h1>
        <Link href="/app/campagnes/nouvelle" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">Nouvelle campagne</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {initial.map((c) => (
          <li key={c.id}>
            <Link href={`/app/campagnes/${c.id}`} className="block rounded-lg bg-white p-4 shadow-sm">
              <div className="flex justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm opacity-60">{statusLabel(c.status)}</span>
              </div>
              <p className="mt-1 text-sm opacity-60">{c.sent_count}/{c.total_recipients} envoyés · {c.failed_count} échecs</p>
            </Link>
          </li>
        ))}
        {initial.length === 0 && <p className="opacity-60">Aucune campagne pour l’instant.</p>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: nouvelle/ (composer) + [id]/ (détail)**

`apps/web/src/app/app/campagnes/nouvelle/page.tsx` (server, charge le compte de destinataires opt-in) :
```tsx
import { createSupabaseServer } from '@/lib/supabase/server'
import { CampaignForm } from './form'

export const dynamic = 'force-dynamic'

export default async function NouvelleCampagnePage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true })
    .eq('restaurant_id', member?.restaurant_id).eq('opted_out', false)
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-bold">Nouvelle campagne</h1>
      <CampaignForm recipientCount={count ?? 0} />
    </main>
  )
}
```

`apps/web/src/app/app/campagnes/nouvelle/form.tsx` (client : compose + choix envoyer/programmer/brouillon + upload média via l'action) :
```tsx
'use client'
import { useState } from 'react'
import { createCampaign, uploadCampaignMedia } from '../actions'

export function CampaignForm({ recipientCount }: { recipientCount: number }) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.set('media', file)
    try { setMediaUrl(await uploadCampaignMedia(fd)) } finally { setUploading(false) }
  }
  return (
    <form action={createCampaign} className="flex flex-col gap-4">
      <input name="name" required placeholder="Nom de la campagne (interne)" className="rounded border p-2" />
      <textarea name="body" required rows={5} placeholder="Votre message…" className="rounded border p-2" />
      <input type="hidden" name="media_url" value={mediaUrl} />
      <label className="text-sm">Image (optionnel)
        <input type="file" accept="image/*" onChange={onUpload} className="mt-1 block text-sm" />
      </label>
      {uploading && <p className="text-sm opacity-60">Upload…</p>}
      {mediaUrl && <p className="text-sm text-green-700">Image jointe ✓</p>}
      <p className="text-sm opacity-70">Destinataires (clients opt-in) : <strong>{recipientCount}</strong></p>
      <label className="text-sm">Programmer (optionnel)
        <input type="datetime-local" name="scheduled_at" className="mt-1 block rounded border p-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button name="action" value="now" className="rounded bg-neutral-900 px-4 py-2 text-white">Envoyer maintenant</button>
        <button name="action" value="schedule" className="rounded border px-4 py-2">Programmer</button>
        <button name="action" value="draft" className="rounded border px-4 py-2">Brouillon</button>
      </div>
      <p className="text-xs opacity-50">Les messages partent progressivement (anti-blocage WhatsApp). Les clients désabonnés (STOP) sont automatiquement exclus.</p>
    </form>
  )
}
```

`apps/web/src/app/app/campagnes/[id]/page.tsx` (server) :
```tsx
import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { CampaignDetail } from './detail'

export const dynamic = 'force-dynamic'

export default async function CampagneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServer()
  const { data: c } = await supabase.from('campaigns')
    .select('id, name, body, status, total_recipients, sent_count, failed_count, scheduled_at').eq('id', id).maybeSingle()
  if (!c) notFound()
  return <CampaignDetail c={c} />
}
```

`apps/web/src/app/app/campagnes/[id]/detail.tsx` (client : realtime + annulation) :
```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { campaignProgress, type CampaignStatus } from '@goutatou/db/types'
import { canCancel, statusLabel } from '@/lib/campaigns'
import { cancelCampaign } from '../actions'

interface C { id: string; name: string; body: string; status: CampaignStatus; total_recipients: number; sent_count: number; failed_count: number }

export function CampaignDetail({ c }: { c: C }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel(`campaign-${c.id}`).on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${c.id}` }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [c.id, router])
  const p = campaignProgress(c.total_recipients, c.sent_count, c.failed_count)
  return (
    <main className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <span className="text-sm opacity-60">{statusLabel(c.status)}</span>
      </div>
      <p className="mb-6 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm shadow-sm">{c.body}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-white p-3 shadow-sm"><p className="text-2xl font-bold">{p.sent}</p><p className="text-xs opacity-60">Envoyés</p></div>
        <div className="rounded-lg bg-white p-3 shadow-sm"><p className="text-2xl font-bold">{p.pending}</p><p className="text-xs opacity-60">En attente</p></div>
        <div className="rounded-lg bg-white p-3 shadow-sm"><p className="text-2xl font-bold text-red-600">{p.failed}</p><p className="text-xs opacity-60">Échecs</p></div>
      </div>
      {canCancel(c.status) && (
        <form action={cancelCampaign.bind(null, c.id)} className="mt-6">
          <button className="rounded border border-red-300 px-4 py-2 text-sm text-red-600">Annuler la campagne</button>
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Lien de nav**

Dans `apps/web/src/app/app/layout.tsx`, ajouter dans la nav : `<Link href="/app/campagnes" className="text-sm hover:underline">Campagnes</Link>`.

- [ ] **Step 7: Vérifier** — Run: `pnpm --filter @goutatou/web test && pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web build` — tous PASS, routes `/app/campagnes*` présentes, pas de node:crypto en bundle client.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): UI campagnes WhatsApp (liste realtime, composer, détail, gating premium)"
```

---

### Task 10: Déploiement + smoke test

**Files:**
- Modify: `.env.example`, `docs/deploiement.md`

**Interfaces:**
- Consumes: MCP Supabase (`apply_migration` 0008 + 0009), Railway (variables worker), Netlify (auto-deploy).

- [ ] **Step 1: Migrations en prod** — via MCP Supabase `apply_migration` : d'abord `campaigns` (contenu de 0008), puis `campaign_counters` (contenu de 0009). Vérifier `list_tables` (campaigns, campaign_recipients présentes, RLS on) puis `get_advisors` (security) — aucun nouvel avis de listing (le bucket campaign-media n'a pas de policy select).

- [ ] **Step 2: Variables Railway (worker)** — sur le service `whatsapp-bot`, poser (optionnel, défauts sinon) : `CAMPAIGN_POLL_MS=15000`, `CAMPAIGN_SEND_DELAY_MIN_MS=4000`, `CAMPAIGN_SEND_DELAY_MAX_MS=8000`, `CAMPAIGN_DAILY_CAP=500`, `CAMPAIGN_BATCH_SIZE=50`. Le push GitHub (merge main) redéploie le service ; vérifier les logs : `[campaign-worker] démarré`.

- [ ] **Step 3: .env.example + doc** — ajouter les 5 variables `CAMPAIGN_*` (commentées) ; dans `docs/deploiement.md`, section « Campagnes WhatsApp (phase 4A) » : gating premium (`subscriptions.plan = 'premium'`), le worker Railway et son rate-limit, l'opt-out par STOP, et le fait que passer un resto en premium se fait en base (`update subscriptions set plan = 'premium' where restaurant_id = ...`).

- [ ] **Step 4: Smoke test** (resto premium avec canal Whapi connecté) :
1. Passer un resto de test en premium (SQL).
2. `/app/campagnes` → « Nouvelle campagne » → message court → « Envoyer maintenant ».
3. Vérifier : la campagne passe `sending` → progression `sent` qui monte (realtime), les clients opt-in reçoivent le message sur WhatsApp espacés de ~4-8 s, un client qui répond `STOP` passe `opted_out` et n'est plus ciblé.
4. Annuler une campagne en cours → l'envoi s'arrête au lot suivant.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/deploiement.md
git commit -m "docs: déploiement phase 4A (worker campagnes, variables, gating premium)"
```

---

## Self-Review (fait à la rédaction)

- **Couverture spec 4A** : tables+RLS+realtime+bucket (T1), types (T2), opt-out mot-clé (T3-T4), throttle anti-ban (T5), repo campagnes + cap journalier + compteurs atomiques (T6), worker (T7), câblage service (T8), gating premium + UI compose/liste/détail realtime + annulation (T9), déploiement + smoke (T10). Une seule campagne `sending` par resto : le worker traite les campagnes `sending` séquentiellement par tick ; contrainte stricte non forcée en base mais l'UI ne crée qu'une campagne à la fois — noté comme limite acceptable (le cap journalier et le throttle protègent le canal quel que soit le nombre).
- **Placeholders** : aucun ; code complet pour chaque module testable et migration.
- **Cohérence de types** : `CampaignStatus`/`RecipientStatus`/`CampaignProgress` définis en T2 et consommés partout ; `CampaignRepo`/`DueCampaign`/`PendingRecipient` définis en T6 et consommés par le worker T7 et son test ; `WorkerDeps` définie en T7 ; signatures `setOptedOut` alignées entre repo (T4) et test opt-out.
- **Sécurité** : worker et repo campagnes en service-role côté Railway ; web actions gated `assertPremium` + resto du membre ; `bump_campaign_counter` révoquée de public (service_role only) ; bucket campaign-media tenant-scopé sans listing ; opt-out exclut toujours de l'audience.
```
