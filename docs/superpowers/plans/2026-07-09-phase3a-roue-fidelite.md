# Goutatou Phase 3A (Roue de fidélité + lots) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après N commandes récupérées, un restaurant Pro offre à son client un tour de roue de la fortune (lien WhatsApp signé, usage unique) ; le tirage pondéré et le décrément de stock se font atomiquement côté serveur, et le lot gagné donne un code validable au comptoir.

**Architecture:** Le notifier Railway (déjà branché sur les changements de statut de commande) envoie le lien de roue quand une commande passe `recuperee` et que le déclencheur est atteint. Le lien porte un token HMAC signé (usage unique, TTL 72h). La page `/roue` (Netlify) valide le token et anime la roue ; le résultat vient d'une fonction SQL atomique `spin_wheel` (service_role-only) — tirage pondéré par poids × stock, décrément atomique, code unique, jti consommé. Le dashboard `/app/fidelite` (gating Pro) configure les lots/réglages et valide les codes au comptoir.

**Tech Stack:** monorepo pnpm existant · TypeScript strict · Supabase (Postgres + RLS + fonctions security definer) · services/whatsapp (Railway) · Next.js 15 (Netlify) · node:crypto (token HMAC, pas de dépendance JWT) · Vitest + pgTAP.

## Global Constraints

- Textes FR ; prix/valeurs FCFA le cas échéant ; TypeScript `"strict": true`.
- Le tirage est **exclusivement côté serveur** (fonction SQL `spin_wheel`, `service_role`-only) — le client ne l'influence jamais.
- Token de roue : HMAC-SHA256 signé (secret env `WHEEL_JWT_SECRET`), payload `{ rid, cid, jti, exp }`, TTL 72h, **usage unique** (jti vérifié/consommé dans `spin_wheel`).
- Atomicité : double appel même `jti` → un seul spin (`already_spun`) ; stock décrémenté atomiquement (jamais négatif ; `-1` = illimité) ; pas de tirage si aucun lot actif à stock disponible.
- Gating **Pro** : la config fidélité et la redemption sont réservées aux restos `subscriptions.plan in ('pro','premium')` ET `status='active'` (vérifié côté serveur).
- Client service-role et token HMAC (node:crypto) UNIQUEMENT côté serveur (notifier, route handlers). Composants client importent uniquement `@goutatou/db/types`.
- Migrations DDL via MCP `apply_migration` en prod après vérif locale (`supabase db reset && supabase test db`). RLS tenant sur `prizes`/`wheel_spins`.
- Railway n'est PAS auto-deploy : après merge main, redéployer le bot via `railway up --detach --service whatsapp-bot`.
- Commits fréquents, préfixes `feat:`/`fix:`/`test:`/`chore:`/`docs:`.

## File Structure (cible)

```
supabase/migrations/
├── 20260709000010_loyalty.sql          # prizes + wheel_spins + colonnes restaurants + RLS
└── 20260709000011_spin_wheel_fn.sql    # fonction spin_wheel atomique (service_role-only)
packages/db/src/
├── wheel-token.ts    # signWheelToken / verifyWheelToken (HMAC, TTL, jti) [server-only]
├── types.ts          # + WheelPrize, WheelSpinResult, WheelTriggerConfig
└── index.ts          # (wheel-token exposé via subpath ./wheel dans package.json exports)
packages/db/package.json                # + "./wheel": "./src/wheel-token.ts"
services/whatsapp/src/
├── config.ts         # + wheelSecret, wheelBaseUrl
├── loyalty/trigger.ts # shouldOfferSpin (pur, testé) + buildWheelLink
├── notifier.ts       # + envoi du lien roue après 'recuperee' si déclencheur atteint
└── index.ts          # passe wheelSecret/wheelBaseUrl au notifier
apps/web/src/
├── lib/premium.ts    # + isPro / assertPlan(['pro','premium'])
├── lib/wheel.ts      # helpers purs UI (rotation cible d'une roue) [testé]
├── app/roue/{page.tsx, wheel.tsx}       # page publique + composant client animé
├── app/api/roue/spin/route.ts           # POST spin (service-role, spin_wheel)
└── app/app/fidelite/{page.tsx, prizes.tsx, actions.ts}  # config lots + réglages + redemption
packages/db/test/{wheel-token.test.ts}
services/whatsapp/test/{loyalty-trigger.test.ts}
apps/web/test/{wheel.test.ts}
supabase/tests/database/04_spin_wheel.test.sql
```

---

### Task 1: Migration 0010 — tables fidélité + colonnes + RLS

**Files:**
- Create: `supabase/migrations/20260709000010_loyalty.sql`

**Interfaces:**
- Produces: tables `prizes`, `wheel_spins` ; enums aucun ; colonnes `restaurants.wheel_enabled`, `restaurants.wheel_trigger_orders` ; RLS tenant. Consommés par toutes les tâches suivantes.

- [ ] **Step 1: Écrire la migration**

`supabase/migrations/20260709000010_loyalty.sql` :
```sql
alter table restaurants add column wheel_enabled boolean not null default false;
alter table restaurants add column wheel_trigger_orders int not null default 5 check (wheel_trigger_orders >= 1);

create table prizes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  weight int not null default 1 check (weight >= 1),
  stock int not null default -1,          -- -1 = illimité
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index prizes_active_idx on prizes (restaurant_id, active);

create table wheel_spins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  prize_id uuid not null references prizes(id),
  code text not null,
  jti text not null unique,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  unique (restaurant_id, code)
);
create index wheel_spins_code_idx on wheel_spins (restaurant_id, code);

alter table prizes enable row level security;
alter table wheel_spins enable row level security;

create policy tenant_all_prizes on prizes for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_wheel_spins on wheel_spins for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
```

- [ ] **Step 2: Vérifier en local** — Run: `supabase db reset && supabase test db` — Expected: migrations 0001→0010 s'appliquent, pgTAP 21/21 inchangés.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260709000010_loyalty.sql
git commit -m "feat(db): tables prizes + wheel_spins + colonnes roue + RLS (migration 0010)"
```

---

### Task 2: Migration 0011 — fonction `spin_wheel` atomique + test pgTAP

**Files:**
- Create: `supabase/migrations/20260709000011_spin_wheel_fn.sql`
- Test: `supabase/tests/database/04_spin_wheel.test.sql`

**Interfaces:**
- Produces: `spin_wheel(p_restaurant_id uuid, p_customer_id uuid, p_jti text) returns table (prize_id uuid, label text, code text)`. `service_role`-only. Atomique : rejette `already_spun` si jti déjà consommé, `no_prize` si aucun lot dispo ; tirage pondéré parmi les lots `active` à stock `<> 0` ; décrémente le stock (si `> 0`) ; code unique 6 car.

- [ ] **Step 1: Écrire le test pgTAP (échoue d'abord)**

`supabase/tests/database/04_spin_wheel.test.sql` :
```sql
begin;
select plan(5);

insert into restaurants (id, slug, name, wheel_enabled) values
  ('40000000-0000-0000-0000-000000000001', 'resto-w', 'Resto W', true);
insert into customers (id, restaurant_id, phone, chat_id) values
  ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '24177000900', '24177000900@s.whatsapp.net');
insert into prizes (id, restaurant_id, label, weight, stock) values
  ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Café offert', 1, 2);

-- 1er spin : gagne le seul lot dispo, code renvoyé
select isnt((select code from spin_wheel(
  '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'jti-A')), null, 'spin renvoie un code');
-- stock décrémenté à 1
select results_eq($$select stock from prizes where id='40000000-0000-0000-0000-000000000003'$$, array[1], 'stock -1');
-- même jti → already_spun
select throws_like($$select * from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-A')$$, '%already_spun%', 'jti unique');
-- un spin de plus (jti-B) épuise le stock à 0
select isnt((select code from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-B')), null, '2e spin ok');
-- plus de stock → no_prize
select throws_like($$select * from spin_wheel(
  '40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','jti-C')$$, '%no_prize%', 'stock épuisé');

select * from finish();
rollback;
```

- [ ] **Step 2: Vérifier l'échec** — Run: `supabase test db` — Expected: FAIL (`function spin_wheel does not exist`).

- [ ] **Step 3: Écrire la migration**

`supabase/migrations/20260709000011_spin_wheel_fn.sql` :
```sql
create or replace function spin_wheel(p_restaurant_id uuid, p_customer_id uuid, p_jti text)
returns table (prize_id uuid, label text, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_prize prizes%rowtype;
  v_total bigint;
  v_code text;
begin
  if exists (select 1 from wheel_spins where jti = p_jti) then
    raise exception 'already_spun';
  end if;

  -- Somme des poids des lots disponibles
  select coalesce(sum(weight), 0) into v_total
  from prizes where restaurant_id = p_restaurant_id and active and stock <> 0;
  if v_total = 0 then
    raise exception 'no_prize';
  end if;

  -- Tirage pondéré : premier lot dont le poids cumulé franchit le seuil aléatoire
  select p.* into v_prize from (
    select *, sum(weight) over (order by position, id) as cum
    from prizes where restaurant_id = p_restaurant_id and active and stock <> 0
  ) p
  where p.cum >= random() * v_total
  order by p.cum
  limit 1;

  -- Décrément atomique si stock fini
  if v_prize.stock > 0 then
    update prizes set stock = stock - 1 where id = v_prize.id and stock > 0;
  end if;

  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti)
  values (p_restaurant_id, p_customer_id, v_prize.id, v_code, p_jti);

  return query select v_prize.id, v_prize.label, v_code;
end;
$$;

revoke execute on function spin_wheel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function spin_wheel(uuid, uuid, text) to service_role;
```

- [ ] **Step 4: Vérifier le pass** — Run: `supabase db reset && supabase test db` — Expected: 04_spin_wheel 5/5 PASS, total pgTAP 26.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260709000011_spin_wheel_fn.sql supabase/tests/database/04_spin_wheel.test.sql
git commit -m "feat(db): fonction spin_wheel atomique (tirage pondéré, stock, jti) + pgTAP (migration 0011)"
```

---

### Task 3: Token de roue HMAC (signé, TTL, jti)

**Files:**
- Create: `packages/db/src/wheel-token.ts`
- Modify: `packages/db/package.json` (exports `./wheel`)
- Test: `packages/db/test/wheel-token.test.ts`

**Interfaces:**
- Produces (`@goutatou/db/wheel`, server-only) :
  - `interface WheelClaims { rid: string; cid: string; jti: string; exp: number }`
  - `signWheelToken(claims: Omit<WheelClaims,'jti'|'exp'> & { jti: string; ttlSec: number }, secret: string, nowSec: number): string` — format `base64url(payload).base64url(hmacSHA256)`.
  - `verifyWheelToken(token: string, secret: string, nowSec: number): WheelClaims | null` — `null` si signature invalide, malformé, ou expiré (`exp < nowSec`). `nowSec` injecté pour tests déterministes.

- [ ] **Step 1: Test (échoue d'abord)**

`packages/db/test/wheel-token.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { signWheelToken, verifyWheelToken } from '../src/wheel-token.js'

const SECRET = 'wheel-secret-123'
const base = { rid: 'r1', cid: 'c1', jti: 'j1', ttlSec: 3600 }

describe('wheel token', () => {
  it('signe puis vérifie à l’identique', () => {
    const t = signWheelToken(base, SECRET, 1000)
    const claims = verifyWheelToken(t, SECRET, 1500)
    expect(claims).toEqual({ rid: 'r1', cid: 'c1', jti: 'j1', exp: 1000 + 3600 })
  })
  it('rejette une signature falsifiée', () => {
    const t = signWheelToken(base, SECRET, 1000)
    expect(verifyWheelToken(t, 'mauvais-secret', 1500)).toBeNull()
    expect(verifyWheelToken(t.slice(0, -3) + 'xxx', SECRET, 1500)).toBeNull()
  })
  it('rejette un token expiré', () => {
    const t = signWheelToken(base, SECRET, 1000)
    expect(verifyWheelToken(t, SECRET, 1000 + 3601)).toBeNull()
  })
  it('rejette un token malformé', () => {
    expect(verifyWheelToken('nimportequoi', SECRET, 1000)).toBeNull()
    expect(verifyWheelToken('', SECRET, 1000)).toBeNull()
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/db test -- wheel-token` — FAIL.

- [ ] **Step 3: Implémenter**

`packages/db/src/wheel-token.ts` :
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface WheelClaims {
  rid: string
  cid: string
  jti: string
  exp: number
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest())
}

export function signWheelToken(
  claims: { rid: string; cid: string; jti: string; ttlSec: number },
  secret: string,
  nowSec: number,
): string {
  const payload: WheelClaims = { rid: claims.rid, cid: claims.cid, jti: claims.jti, exp: nowSec + claims.ttlSec }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

export function verifyWheelToken(token: string, secret: string, nowSec: number): WheelClaims | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = sign(payloadB64, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const claims = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as WheelClaims
    if (typeof claims.exp !== 'number' || claims.exp < nowSec) return null
    if (!claims.rid || !claims.cid || !claims.jti) return null
    return claims
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Exposer le sous-chemin** — dans `packages/db/package.json`, ajouter à `exports` : `"./wheel": "./src/wheel-token.ts"`.

- [ ] **Step 5: Vérifier le pass** — Run: `pnpm --filter @goutatou/db test && pnpm --filter @goutatou/db typecheck` — 4 tests PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/wheel-token.ts packages/db/package.json packages/db/test/wheel-token.test.ts
git commit -m "feat(db): token de roue HMAC signé (usage unique via jti, TTL) + sous-chemin ./wheel"
```

---

### Task 4: Types partagés fidélité

**Files:**
- Modify: `packages/db/src/types.ts`
- Test: `packages/db/test/wheel-types.test.ts`

**Interfaces:**
- Produces (`@goutatou/db/types`) :
  - `interface WheelPrize { id: string; label: string; weight: number; stock: number; active: boolean }`
  - `interface WheelSpinResult { prizeId: string; label: string; code: string }`
  - `function shouldOfferSpin(recuperatedCount: number, triggerN: number): boolean` — `true` si `triggerN >= 1` et `recuperatedCount > 0` et `recuperatedCount % triggerN === 0`.

- [ ] **Step 1: Test (échoue d'abord)**

`packages/db/test/wheel-types.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { shouldOfferSpin } from '../src/types.js'

describe('shouldOfferSpin', () => {
  it('offre un tour au multiple de N', () => {
    expect(shouldOfferSpin(5, 5)).toBe(true)
    expect(shouldOfferSpin(10, 5)).toBe(true)
    expect(shouldOfferSpin(4, 5)).toBe(false)
    expect(shouldOfferSpin(6, 5)).toBe(false)
  })
  it('jamais à 0 commande, et N>=1 requis', () => {
    expect(shouldOfferSpin(0, 5)).toBe(false)
    expect(shouldOfferSpin(3, 0)).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/db test -- wheel-types` — FAIL.

- [ ] **Step 3: Ajouter à `packages/db/src/types.ts`** (à la fin) :
```ts
export interface WheelPrize {
  id: string
  label: string
  weight: number
  stock: number
  active: boolean
}

export interface WheelSpinResult {
  prizeId: string
  label: string
  code: string
}

export function shouldOfferSpin(recuperatedCount: number, triggerN: number): boolean {
  return triggerN >= 1 && recuperatedCount > 0 && recuperatedCount % triggerN === 0
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/db test` — tous PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/types.ts packages/db/test/wheel-types.test.ts
git commit -m "feat(db): types WheelPrize/WheelSpinResult + shouldOfferSpin"
```

---

### Task 5: Déclencheur roue dans le notifier + config

**Files:**
- Modify: `services/whatsapp/src/config.ts`, `services/whatsapp/src/notifier.ts`, `services/whatsapp/src/index.ts`
- Create: `services/whatsapp/src/loyalty/trigger.ts`
- Test: `services/whatsapp/test/loyalty-trigger.test.ts`, extension de `services/whatsapp/test/notifier.test.ts`

**Interfaces:**
- Consumes: `signWheelToken` (`@goutatou/db/wheel`), `shouldOfferSpin` (`@goutatou/db/types`), `handleOrderUpdate` (phase 1).
- Produces:
  - `services/whatsapp/src/loyalty/trigger.ts` : `buildWheelLink(baseUrl: string, token: string): string` (= `${baseUrl}/roue?t=${token}`) et `wheelMessage(link: string): string` (message FR d'invitation).
  - Config : `wheelSecret` (required), `wheelBaseUrl` (required).
  - `handleOrderUpdate` gagne 2 params optionnels `wheelSecret`/`wheelBaseUrl` ; après l'envoi du message `recuperee`, si la roue est activée pour le resto, compte les commandes `recuperee` du client, et si `shouldOfferSpin` + au moins un lot dispo, envoie le lien de roue (token signé, jti = uuid).

- [ ] **Step 1: Test du helper (échoue d'abord)**

`services/whatsapp/test/loyalty-trigger.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { buildWheelLink, wheelMessage } from '../src/loyalty/trigger.js'

describe('loyalty trigger helpers', () => {
  it('construit le lien roue', () => {
    expect(buildWheelLink('https://goutatou.netlify.app', 'TOK')).toBe('https://goutatou.netlify.app/roue?t=TOK')
  })
  it('message FR contient le lien', () => {
    const m = wheelMessage('https://x/roue?t=TOK')
    expect(m).toContain('https://x/roue?t=TOK')
    expect(m.toLowerCase()).toContain('roue')
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- loyalty-trigger` — FAIL.

- [ ] **Step 3: Implémenter le helper**

`services/whatsapp/src/loyalty/trigger.ts` :
```ts
export function buildWheelLink(baseUrl: string, token: string): string {
  return `${baseUrl}/roue?t=${token}`
}

export function wheelMessage(link: string): string {
  return (
    `🎉 Bravo, vous avez gagné un tour de *roue de la fortune* ! 🎡\n` +
    `Tentez votre chance ici (lien valable 72h) :\n${link}`
  )
}
```

- [ ] **Step 4: Étendre la config**

Dans `services/whatsapp/src/config.ts`, ajouter à l'objet retourné :
```ts
    wheelSecret: required('WHEEL_JWT_SECRET'),
    wheelBaseUrl: required('WHEEL_BASE_URL'),
```

- [ ] **Step 5: Brancher le déclencheur dans le notifier**

Dans `services/whatsapp/src/notifier.ts` :
- importer en tête :
```ts
import { randomUUID } from 'node:crypto'
import { signWheelToken } from '@goutatou/db/wheel'
import { shouldOfferSpin } from '@goutatou/db/types'
import { buildWheelLink, wheelMessage } from './loyalty/trigger.js'
```
- étendre la signature de `handleOrderUpdate` avec deux params optionnels (après `decrypt`) :
```ts
  wheelSecret?: string,
  wheelBaseUrl?: string,
```
- après l'envoi réussi du message de statut (dans le `try`), ajouter le déclencheur si `newRow.status === 'recuperee'` et les secrets présents :
```ts
    if (newRow.status === 'recuperee' && wheelSecret && wheelBaseUrl) {
      const whapiClient = makeWhapi(decrypt(channel.token_encrypted, tokenKey))
      const { data: resto } = await db.from('restaurants')
        .select('wheel_enabled, wheel_trigger_orders').eq('id', newRow.restaurant_id).single()
      if (resto?.wheel_enabled) {
        const { count } = await db.from('orders').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', newRow.restaurant_id).eq('customer_id', newRow.customer_id).eq('status', 'recuperee')
        const { count: prizeCount } = await db.from('prizes').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', newRow.restaurant_id).eq('active', true).neq('stock', 0)
        if (shouldOfferSpin(count ?? 0, resto.wheel_trigger_orders) && (prizeCount ?? 0) > 0) {
          const token = signWheelToken(
            { rid: newRow.restaurant_id, cid: newRow.customer_id, jti: randomUUID(), ttlSec: 72 * 3600 },
            wheelSecret, Math.floor(Date.now() / 1000))
          try {
            await whapiClient.sendText(customer.chat_id, wheelMessage(buildWheelLink(wheelBaseUrl, token)))
          } catch (err) { console.error('[notifier] envoi roue échoué', err) }
        }
      }
    }
```
Note : `makeWhapi` renvoyait `Pick<WhapiClient,'sendText'>` — c'est suffisant ici. Réutiliser le `customer`/`channel` déjà chargés en haut de la fonction.

- [ ] **Step 6: Passer les secrets dans `index.ts`** — `startNotifier` doit propager `wheelSecret`/`wheelBaseUrl` à `handleOrderUpdate`. Modifier `startNotifier(db, tokenKey)` en `startNotifier(db, tokenKey, wheelSecret?, wheelBaseUrl?)` et, dans le callback Realtime, appeler `handleOrderUpdate(db, tokenKey, old, new, undefined, undefined, wheelSecret, wheelBaseUrl)`. Dans `index.ts`, appeler `startNotifier(db, config.tokenKey, config.wheelSecret, config.wheelBaseUrl)`.

- [ ] **Step 7: Étendre le test notifier** — ajouter à `services/whatsapp/test/notifier.test.ts` un cas : `recuperee` avec `wheel_enabled` + count multiple de N + prizeCount>0 → `sendText` appelé une 2e fois avec un message contenant `/roue?t=`. Mocker `db.from('restaurants')`, `db.from('orders')` (count), `db.from('prizes')` (count) via le fake db. Fournir `wheelSecret`/`wheelBaseUrl`. Et un cas `wheel_enabled=false` → pas d'envoi de roue.

- [ ] **Step 8: Vérifier** — Run: `pnpm --filter @goutatou/service-whatsapp test && pnpm --filter @goutatou/service-whatsapp typecheck` — tous PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add services/whatsapp/src
git commit -m "feat(bot): déclencheur roue de fidélité dans le notifier (lien signé après N commandes récupérées)"
```

---

### Task 6: Web — API spin + page /roue

**Files:**
- Create: `apps/web/src/lib/wheel.ts`, `apps/web/src/app/api/roue/spin/route.ts`, `apps/web/src/app/roue/{page.tsx, wheel.tsx}`
- Test: `apps/web/test/wheel.test.ts`

**Interfaces:**
- Consumes: `verifyWheelToken` (`@goutatou/db/wheel`), `createAdminClient`, `decryptToken` + `WhapiClient` (confirmation code), RPC `spin_wheel`.
- Produces:
  - `apps/web/src/lib/wheel.ts` : `targetRotationDeg(index: number, count: number, turns?: number): number` (angle final pour aligner le secteur `index` en haut, `turns` tours complets) — pur, testé.
  - `POST /api/roue/spin` (runtime nodejs) : body `{ t: string }` → `verifyWheelToken` → `spin_wheel(rid, cid, jti)` → renvoie `{ prizeId, label, code }` ou `{ error }` (400 token invalide/expiré, 409 `already_spun`, 200 sinon). Envoie le code par WhatsApp best-effort.
  - `/roue` : server component qui lit `?t`, vérifie le token, charge les lots actifs pour dessiner la roue, rend `<Wheel>` (client) ; token invalide → message d'erreur FR.

- [ ] **Step 1: Test du helper (échoue d'abord)**

`apps/web/test/wheel.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { targetRotationDeg } from '../src/lib/wheel'

describe('targetRotationDeg', () => {
  it('aligne le secteur choisi en haut avec des tours complets', () => {
    // 4 secteurs de 90° ; secteur 0 centré en haut = 0° + tours
    expect(targetRotationDeg(0, 4, 5) % 360).toBe(0)
    // secteur 1 : il faut tourner de -90° (mod 360 = 270) pour l'amener en haut
    expect(targetRotationDeg(1, 4, 5) % 360).toBe(270)
  })
  it('ajoute les tours complets demandés', () => {
    expect(targetRotationDeg(0, 4, 5)).toBeGreaterThanOrEqual(5 * 360)
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/web test -- wheel` — FAIL.

- [ ] **Step 3: Implémenter le helper**

`apps/web/src/lib/wheel.ts` :
```ts
export function targetRotationDeg(index: number, count: number, turns = 5): number {
  if (count <= 0) return turns * 360
  const sector = 360 / count
  // Ramener le centre du secteur `index` en haut (0°) : rotation = tours - index*sector
  const align = (360 - index * sector) % 360
  return turns * 360 + align
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/web test -- wheel` — PASS.

- [ ] **Step 5: Route API spin**

`apps/web/src/app/api/roue/spin/route.ts` :
```ts
import { NextResponse } from 'next/server'
import { verifyWheelToken } from '@goutatou/db/wheel'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const token = (body as { t?: string })?.t
  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })
  const claims = verifyWheelToken(token, process.env.WHEEL_JWT_SECRET!, Math.floor(Date.now() / 1000))
  if (!claims) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 })

  const db = createAdminClient()
  const { data, error } = await db.rpc('spin_wheel', {
    p_restaurant_id: claims.rid, p_customer_id: claims.cid, p_jti: claims.jti,
  })
  if (error) {
    const msg = String(error.message)
    if (msg.includes('already_spun')) return NextResponse.json({ error: 'Vous avez déjà tourné la roue.' }, { status: 409 })
    if (msg.includes('no_prize')) return NextResponse.json({ error: 'Aucun lot disponible pour le moment.' }, { status: 409 })
    return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })
  }
  const row = data?.[0] as { prize_id: string; label: string; code: string } | undefined
  if (!row) return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })

  // Envoi du code par WhatsApp best-effort
  const { data: customer } = await db.from('customers').select('chat_id').eq('id', claims.cid).single()
  const { data: channel } = await db.from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', claims.rid).single()
  if (customer && channel?.status === 'active') {
    try {
      await new WhapiClient(decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))
        .sendText(customer.chat_id, `🎁 Vous avez gagné : *${row.label}* !\nVotre code : *${row.code}*\nPrésentez-le au restaurant pour en profiter.`)
    } catch (err) { console.error('[roue] envoi code échoué', err) }
  }

  return NextResponse.json({ prizeId: row.prize_id, label: row.label, code: row.code })
}
```

- [ ] **Step 6: Page /roue + composant**

`apps/web/src/app/roue/page.tsx` :
```tsx
import { verifyWheelToken } from '@goutatou/db/wheel'
import { createAdminClient } from '@/lib/supabase/admin'
import { Wheel } from './wheel'

export const dynamic = 'force-dynamic'

export default async function RouePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const claims = t ? verifyWheelToken(t, process.env.WHEEL_JWT_SECRET!, Math.floor(Date.now() / 1000)) : null
  if (!t || !claims) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-center"><p className="opacity-70">Ce lien de roue est invalide ou expiré.</p></main>
  }
  const db = createAdminClient()
  const { data: resto } = await db.from('restaurants').select('name').eq('id', claims.rid).single()
  const { data: prizes } = await db.from('prizes')
    .select('id, label').eq('restaurant_id', claims.rid).eq('active', true).neq('stock', 0).order('position')
  const labels = (prizes ?? []).map((p) => p.label)
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-neutral-900 p-6 text-white">
      <h1 className="text-2xl font-bold">🎡 {resto?.name ?? 'Roue de la fortune'}</h1>
      <Wheel token={t} labels={labels} />
    </main>
  )
}
```

`apps/web/src/app/roue/wheel.tsx` :
```tsx
'use client'
import { useState } from 'react'
import { targetRotationDeg } from '@/lib/wheel'

export function Wheel({ token, labels }: { token: string; labels: string[] }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{ label: string; code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function spin() {
    if (spinning || result) return
    setSpinning(true); setError(null)
    const res = await fetch('/api/roue/spin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Erreur'); setSpinning(false); return }
    const idx = Math.max(0, labels.indexOf(json.label))
    setRotation(targetRotationDeg(idx, labels.length || 1, 6))
    setTimeout(() => { setResult({ label: json.label, code: json.code }); setSpinning(false) }, 4200)
  }

  const sector = 360 / (labels.length || 1)
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-72 w-72">
        <div className="absolute left-1/2 top-0 z-10 -ml-2 h-0 w-0 border-x-8 border-t-[16px] border-x-transparent border-t-yellow-400" />
        <div className="h-full w-full rounded-full border-4 border-yellow-400 transition-transform duration-[4000ms] ease-out"
          style={{ transform: `rotate(${rotation}deg)`,
            background: `conic-gradient(${labels.map((_, i) => `hsl(${(i * 360) / (labels.length || 1)},70%,45%) ${i * sector}deg ${(i + 1) * sector}deg`).join(',')})` }}>
        </div>
      </div>
      {!result && (
        <button onClick={spin} disabled={spinning}
          className="rounded-full bg-yellow-400 px-8 py-3 font-bold text-neutral-900 disabled:opacity-50">
          {spinning ? 'La roue tourne…' : 'Tourner la roue !'}
        </button>
      )}
      {error && <p className="text-red-400">{error}</p>}
      {result && (
        <div className="rounded-2xl bg-white/10 p-6 text-center">
          <p className="text-lg">Vous avez gagné :</p>
          <p className="my-2 text-2xl font-bold text-yellow-400">{result.label}</p>
          <p className="opacity-80">Votre code : <span className="font-mono font-bold">{result.code}</span></p>
          <p className="mt-2 text-sm opacity-60">Présentez ce code au restaurant. Envoyé aussi sur votre WhatsApp.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Vérifier** — `pnpm --filter @goutatou/web test && typecheck && build` — routes `/roue` + `/api/roue/spin` présentes ; pas de node:crypto en bundle client (wheel.tsx n'importe que `@/lib/wheel`, pur).

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): page /roue animée + API spin (tirage serveur atomique, code par WhatsApp)"
```

---

### Task 7: Web — /app/fidelite (config lots + réglages + redemption) + gating Pro

**Files:**
- Create: `apps/web/src/app/app/fidelite/{page.tsx, prizes.tsx, actions.ts}`
- Modify: `apps/web/src/lib/premium.ts` (+ isPro/assertPlan), `apps/web/src/app/app/layout.tsx` (lien)

**Interfaces:**
- Consumes: `createSupabaseServer` (RLS), gating.
- Produces:
  - `premium.ts` : `isPro(supabase, restaurantId): Promise<boolean>` (`plan in ('pro','premium')` ET `status='active'`), `assertPlan(supabase, restaurantId, plans: string[]): Promise<void>`.
  - Server actions : `createPrize/updatePrize/deletePrize`, `updateWheelSettings(wheel_enabled, wheel_trigger_orders)`, `redeemCode(code)` (marque `redeemed_at`/`redeemed_by`, rejette si déjà utilisé/inconnu). Toutes gated `assertPlan(['pro','premium'])`.

- [ ] **Step 1: Étendre premium.ts**

Dans `apps/web/src/lib/premium.ts`, ajouter :
```ts
export async function planOf(supabase: SupabaseClient, restaurantId: string): Promise<{ plan: string; status: string } | null> {
  const { data } = await supabase.from('subscriptions').select('plan, status').eq('restaurant_id', restaurantId).maybeSingle()
  return data ?? null
}
export async function isPro(supabase: SupabaseClient, restaurantId: string): Promise<boolean> {
  const s = await planOf(supabase, restaurantId)
  return !!s && s.status === 'active' && (s.plan === 'pro' || s.plan === 'premium')
}
export async function assertPlan(supabase: SupabaseClient, restaurantId: string, plans: string[]): Promise<void> {
  const s = await planOf(supabase, restaurantId)
  if (!s || s.status !== 'active' || !plans.includes(s.plan)) {
    throw new Error('Fonctionnalité non disponible dans votre offre.')
  }
}
```

- [ ] **Step 2: actions.ts** — pattern identique à `app/menu/actions.ts` (myRestaurantId via restaurant_members) + `assertPlan(supabase, restaurantId, ['pro','premium'])` en tête de CHAQUE action. `createPrize`(label, weight, stock), `updatePrize`(id, …), `deletePrize`(id), `updateWheelSettings`(enabled bool, triggerN int ≥ 1), `redeemCode`(code) : `update wheel_spins set redeemed_at=now(), redeemed_by=<user> where restaurant_id=… and code=… and redeemed_at is null` → si 0 ligne affectée, throw « Code invalide ou déjà utilisé ». `revalidatePath('/app/fidelite')`.

- [ ] **Step 3: page.tsx (server, gating Pro) + prizes.tsx (client, CRUD + redemption)** — `page.tsx` : si `!isPro` → écran d'upsell Pro ; sinon charge les `prizes` + `wheel_enabled`/`wheel_trigger_orders` + les derniers `wheel_spins` non validés, rend le composant. Formulaires reliés aux actions. Champ de saisie de code → `redeemCode`.

- [ ] **Step 4: Lien de nav** — dans `app/layout.tsx`, ajouter `<Link href="/app/fidelite">Fidélité</Link>`.

- [ ] **Step 5: Vérifier** — `pnpm --filter @goutatou/web test && typecheck && build` — route `/app/fidelite` présente, gating OK.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): /app/fidelite (lots, réglages roue, validation code) + gating Pro"
```

---

### Task 8: Déploiement + smoke test

**Files:**
- Modify: `.env.example`, `docs/deploiement.md`

**Interfaces:**
- Consumes: MCP Supabase (migrations 0010+0011), Railway (WHEEL_JWT_SECRET, WHEEL_BASE_URL), Netlify (WHEEL_JWT_SECRET), redeploy bot.

- [ ] **Step 1: Migrations prod** — via MCP `apply_migration` : `loyalty` (contenu 0010) puis `spin_wheel_fn` (contenu 0011). Vérifier `list_tables` (prizes, wheel_spins, RLS on) + ACL `spin_wheel` (service_role only) + `get_advisors`.

- [ ] **Step 2: Variables** — générer `WHEEL_JWT_SECRET` (`openssl rand -hex 32`). Le poser sur **Railway** (`WHEEL_JWT_SECRET`, `WHEEL_BASE_URL=https://goutatou.netlify.app`) ET **Netlify** (`WHEEL_JWT_SECRET` identique — la route /api/roue/spin et la page /roue le lisent au runtime ; non `NEXT_PUBLIC`). Redéployer le bot Railway (`railway up --detach --service whatsapp-bot`).

- [ ] **Step 3: .env.example + doc** — ajouter `WHEEL_JWT_SECRET=` et `WHEEL_BASE_URL=` (commentés) ; section « Fidélité (phase 3A) » dans `docs/deploiement.md` : gating Pro (`update subscriptions set plan='pro'`), configuration des lots dans `/app/fidelite`, déclencheur après N commandes récupérées, validation des codes au comptoir.

- [ ] **Step 4: Smoke test** (resto Pro, canal Whapi connecté) :
1. Passer un resto en `pro` (SQL), configurer 2-3 lots dans `/app/fidelite`, activer la roue avec N=1 (pour tester vite).
2. Passer une commande jusqu'à `recuperee` → le client reçoit le lien de roue sur WhatsApp.
3. Ouvrir le lien → tourner → un lot est gagné, le code s'affiche + arrive sur WhatsApp ; re-cliquer le même lien → « déjà tourné ».
4. Valider le code dans `/app/fidelite` → marqué utilisé ; re-valider → « déjà utilisé ». Vérifier le stock décrémenté.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/deploiement.md
git commit -m "docs: déploiement phase 3A (roue, secrets, gating Pro)"
```

---

## Self-Review (fait à la rédaction)

- **Couverture spec 3A** : tables+RLS (T1), fonction atomique spin_wheel + pgTAP (T2), token HMAC usage unique (T3), types+déclencheur pur (T4), déclencheur notifier après N commandes récupérées (T5), page /roue + API spin serveur (T6), /app/fidelite config+redemption + gating Pro (T7), déploiement+smoke (T8). Sécurité (tirage serveur only, jti usage unique, stock atomique, gating Pro) couverte.
- **Placeholders** : T7 décrit page/actions sans code intégral (patron identique à app/menu + app/campagnes déjà en repo, référencés) ; tout le reste (SQL, token, notifier, API spin, helpers) porte le code complet.
- **Cohérence de types** : `WheelClaims` (T3) consommé par le notifier (T5) et l'API (T6) ; `spin_wheel` signature (T2) = appel RPC (T6) ; `shouldOfferSpin` (T4) utilisé en T5 ; `signWheelToken`/`verifyWheelToken` symétriques (T3) ; gating `assertPlan(['pro','premium'])` (T7) aligné sur la contrainte globale.
- **Sécurité** : `spin_wheel` révoquée de public (service_role only) ; token vérifié serveur ; `@goutatou/db/wheel` (node:crypto) importé uniquement côté serveur ; composant client roue n'importe que le helper pur `@/lib/wheel`.
```
