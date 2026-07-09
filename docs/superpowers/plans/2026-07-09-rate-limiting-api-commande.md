# Rate-limiting API commande web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protéger l'endpoint public `POST /api/lp/[slug]/order` contre le spam (flood WhatsApp → ban du canal, pollution DB) par un rate-limiting durable en trois couches.

**Architecture:** Fonction SQL atomique `hit_rate_limit` (fenêtre fixe, comptage `insert … on conflict`, security-definer service-role-only) + table `rate_limit_hits`. Côté web, des helpers purs (`clientIp`, `orderRateKeys`) et un orchestrateur `enforceRateLimit` appellent la fonction 3× (par numéro, par IP, par resto) **avant toute écriture** ; un dépassement renvoie 429 + `Retry-After`.

**Tech Stack:** Postgres/Supabase (pgTAP), Next.js 15 App Router (route handler nodejs), Vitest, TypeScript strict, monorepo pnpm.

## Global Constraints

- Fonctions SQL sensibles : `SECURITY DEFINER`, `revoke execute from public, anon, authenticated`, `grant execute to service_role` (pattern `create_order`/`spin_wheel`).
- Aucune nouvelle dépendance npm, aucune nouvelle variable d'environnement.
- Migrations nommées `supabase/migrations/YYYYMMDDNNNNNN_*.sql` ; prochaine = `20260709000013_rate_limit.sql`.
- Tests web dans `apps/web/test/**/*.test.ts` (Vitest, `pnpm --filter @goutatou/web test`). pgTAP dans `supabase/tests/database/NN_*.test.sql`.
- Messages utilisateurs en français.
- Limites (constantes, non configurables en base) : phone 3/600 s, IP 12/600 s, resto 60/3600 s.
- Fail-open si `hit_rate_limit` échoue (indispo DB) : logguer et laisser passer.
- Ne jamais importer de crypto/service-client dans un module chargé côté client (les helpers rate-limit sont server-only via la route nodejs).

---

### Task 1: Migration SQL — table + fonction `hit_rate_limit` + pgTAP

**Files:**
- Create: `supabase/migrations/20260709000013_rate_limit.sql`
- Create: `supabase/tests/database/05_rate_limit.test.sql`

**Interfaces:**
- Consumes: rien.
- Produces: fonction SQL
  `hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns table(allowed boolean, retry_after int)`.
  `allowed` = le hit courant est dans la limite ; `retry_after` = secondes avant la fin de la fenêtre courante (0 si `allowed`). Appelable uniquement par `service_role`.

- [ ] **Step 1: Écrire la migration**

Create `supabase/migrations/20260709000013_rate_limit.sql` :

```sql
-- Rate-limiting durable (fenêtre fixe) pour endpoints publics.
-- Comptage atomique via insert … on conflict ; aucun check-then-act.
create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- La table n'est manipulée que par la fonction (service_role). Deny par défaut.
alter table rate_limit_hits enable row level security;

create or replace function hit_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns table(allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  -- Bornage défensif de la fenêtre.
  if p_window_seconds < 1 then
    p_window_seconds := 1;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_hits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  -- Purge opportuniste : évite un cron, garde la table petite.
  if random() < 0.01 then
    delete from rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  allowed := v_count <= p_limit;
  if allowed then
    retry_after := 0;
  else
    retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::int
    );
  end if;
  return next;
end;
$$;

revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
```

- [ ] **Step 2: Écrire le test pgTAP**

Create `supabase/tests/database/05_rate_limit.test.sql` :

```sql
begin;
select plan(6);

-- Limite 2 sur une fenêtre de 60 s.
select ok((select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 1 autorisé');
select ok((select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 2 autorisé (= limite)');
select ok(not (select allowed from hit_rate_limit('k:a', 2, 60)), 'hit 3 bloqué (> limite)');
select ok((select retry_after from hit_rate_limit('k:a', 2, 60)) > 0, 'retry_after > 0 quand bloqué');

-- Une clé distincte n'est pas affectée par les hits de k:a.
select ok((select allowed from hit_rate_limit('k:b', 2, 60)), 'clé distincte indépendante');

-- Comptage persistant en table.
select ok(
  (select count from rate_limit_hits where key = 'k:a') >= 3,
  'compteur k:a >= 3 en table'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Appliquer la migration en local et lancer pgTAP**

Run (adapter au harnais pgTAP local du repo, cf. tâches P3A/P3B) :
```bash
# appliquer la migration 0013 sur la base locale, puis :
pg_prove supabase/tests/database/05_rate_limit.test.sql
```
Expected: `05_rate_limit.test.sql .. ok` — 6/6.

Si aucun harnais pgTAP local n'est disponible dans cette session, vérifier la
migration en l'exécutant telle quelle dans une base Postgres jetable et en
lançant manuellement les 3 premiers `select hit_rate_limit('k:a',2,60);`
(doivent renvoyer allowed=t, t, f). Consigner le résultat.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709000013_rate_limit.sql supabase/tests/database/05_rate_limit.test.sql
git commit -m "feat(db): hit_rate_limit — rate-limit fenêtre fixe atomique (migration 0013) + pgTAP"
```

---

### Task 2: Helpers purs `clientIp` + `orderRateKeys` (module web)

**Files:**
- Create: `apps/web/src/lib/rate-limit.ts`
- Create: `apps/web/test/rate-limit.test.ts`

**Interfaces:**
- Consumes: rien (helpers purs).
- Produces (importés par Task 3) :
  - `type RateRule = { key: string; limit: number; windowSeconds: number }`
  - `clientIp(headers: Headers): string`
  - `orderRateKeys(slug: string, phone: string, ip: string): RateRule[]`
    (ordre garanti : `[phone, ip, resto]`).
  - `RATE_LIMITS` (constante exportée pour les tests) :
    `{ phone: { limit: 3, windowSeconds: 600 }, ip: { limit: 12, windowSeconds: 600 }, resto: { limit: 60, windowSeconds: 3600 } }`.

- [ ] **Step 1: Écrire les tests**

Create `apps/web/test/rate-limit.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { clientIp, orderRateKeys, RATE_LIMITS } from '../src/lib/rate-limit'

function h(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('clientIp', () => {
  it('priorise x-nf-client-connection-ip', () => {
    expect(clientIp(h({ 'x-nf-client-connection-ip': '41.1.2.3', 'x-forwarded-for': '9.9.9.9' }))).toBe('41.1.2.3')
  })
  it('fallback sur le 1er hop de x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': '41.1.2.3, 10.0.0.1' }))).toBe('41.1.2.3')
  })
  it("retourne 'unknown' si aucune IP", () => {
    expect(clientIp(h({}))).toBe('unknown')
  })
})

describe('orderRateKeys', () => {
  it('produit 3 couches dans l’ordre phone, ip, resto', () => {
    const rules = orderRateKeys('chez-mama', '24177000900', '41.1.2.3')
    expect(rules.map((r) => r.key)).toEqual([
      'order:phone:chez-mama:24177000900',
      'order:ip:chez-mama:41.1.2.3',
      'order:resto:chez-mama',
    ])
  })
  it('applique les bonnes limites/fenêtres', () => {
    const rules = orderRateKeys('chez-mama', '24177000900', '41.1.2.3')
    expect(rules[0]).toMatchObject({ limit: RATE_LIMITS.phone.limit, windowSeconds: RATE_LIMITS.phone.windowSeconds })
    expect(rules[1]).toMatchObject({ limit: RATE_LIMITS.ip.limit, windowSeconds: RATE_LIMITS.ip.windowSeconds })
    expect(rules[2]).toMatchObject({ limit: RATE_LIMITS.resto.limit, windowSeconds: RATE_LIMITS.resto.windowSeconds })
  })
})
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `pnpm --filter @goutatou/web test -- rate-limit`
Expected: FAIL — `Cannot find module '../src/lib/rate-limit'`.

- [ ] **Step 3: Implémenter le module**

Create `apps/web/src/lib/rate-limit.ts` :

```ts
export type RateRule = { key: string; limit: number; windowSeconds: number }

export const RATE_LIMITS = {
  phone: { limit: 3, windowSeconds: 600 },
  ip: { limit: 12, windowSeconds: 600 },
  resto: { limit: 60, windowSeconds: 3600 },
} as const

/** IP client réelle : header Netlify prioritaire, sinon 1er hop de x-forwarded-for. */
export function clientIp(headers: Headers): string {
  const nf = headers.get('x-nf-client-connection-ip')
  if (nf) return nf.trim()
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/** Trois couches de rate-limit pour une commande web, dans l'ordre phone → ip → resto. */
export function orderRateKeys(slug: string, phone: string, ip: string): RateRule[] {
  return [
    { key: `order:phone:${slug}:${phone}`, ...RATE_LIMITS.phone },
    { key: `order:ip:${slug}:${ip}`, ...RATE_LIMITS.ip },
    { key: `order:resto:${slug}`, ...RATE_LIMITS.resto },
  ]
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `pnpm --filter @goutatou/web test -- rate-limit`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/rate-limit.ts apps/web/test/rate-limit.test.ts
git commit -m "feat(web): helpers rate-limit purs (clientIp, orderRateKeys)"
```

---

### Task 3: Orchestrateur `enforceRateLimit` + câblage dans la route

**Files:**
- Modify: `apps/web/src/lib/rate-limit.ts` (ajout de `enforceRateLimit`)
- Modify: `apps/web/src/app/api/lp/[slug]/order/route.ts`
- Create: `apps/web/test/rate-limit-enforce.test.ts`

**Interfaces:**
- Consumes: `orderRateKeys`, `clientIp` (Task 2) ; fonction SQL `hit_rate_limit` (Task 1) ; `createAdminClient()` (existant).
- Produces :
  - `type RlDb = { rpc(fn: 'hit_rate_limit', args: { p_key: string; p_limit: number; p_window_seconds: number }): Promise<{ data: { allowed: boolean; retry_after: number }[] | null; error: unknown }> }`
  - `enforceRateLimit(db: RlDb, rules: RateRule[]): Promise<{ ok: true } | { ok: false; retryAfter: number }>`
    — appelle `hit_rate_limit` pour chaque règle dans l'ordre, s'arrête au premier `allowed=false` (renvoie `{ ok:false, retryAfter }`) ; **fail-open** si `error` ou `data` vide (log + continue) ; `{ ok:true }` si toutes passent.

- [ ] **Step 1: Écrire les tests de l'orchestrateur**

Create `apps/web/test/rate-limit-enforce.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest'
import { enforceRateLimit, orderRateKeys, type RateRule } from '../src/lib/rate-limit'

function dbReturning(seq: Array<{ allowed: boolean; retry_after: number } | { error: unknown }>) {
  let i = 0
  return {
    rpc: vi.fn(async () => {
      const step = seq[i++]
      if (step && 'error' in step) return { data: null, error: step.error }
      return { data: [step], error: null }
    }),
  }
}
const rules: RateRule[] = orderRateKeys('s', '241770001', '1.2.3.4')

describe('enforceRateLimit', () => {
  it('ok quand toutes les couches passent', async () => {
    const db = dbReturning([
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
    ])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: true })
    expect(db.rpc).toHaveBeenCalledTimes(3)
  })

  it('bloque et court-circuite au 1er dépassement', async () => {
    const db = dbReturning([
      { allowed: true, retry_after: 0 },
      { allowed: false, retry_after: 42 },
    ])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: false, retryAfter: 42 })
    expect(db.rpc).toHaveBeenCalledTimes(2) // n'appelle pas la 3e règle
  })

  it('fail-open si la DB renvoie une erreur', async () => {
    const db = dbReturning([{ error: new Error('db down') }])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `pnpm --filter @goutatou/web test -- rate-limit-enforce`
Expected: FAIL — `enforceRateLimit is not a function`.

- [ ] **Step 3: Implémenter `enforceRateLimit`**

Append à `apps/web/src/lib/rate-limit.ts` :

```ts
export type RlDb = {
  rpc(
    fn: 'hit_rate_limit',
    args: { p_key: string; p_limit: number; p_window_seconds: number },
  ): Promise<{ data: { allowed: boolean; retry_after: number }[] | null; error: unknown }>
}

/**
 * Applique les règles dans l'ordre, s'arrête au 1er dépassement.
 * Fail-open : en cas d'erreur DB, on laisse passer (le checkout ne doit pas
 * tomber sur un incident du sous-système rate-limit).
 */
export async function enforceRateLimit(
  db: RlDb,
  rules: RateRule[],
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  for (const r of rules) {
    const { data, error } = await db.rpc('hit_rate_limit', {
      p_key: r.key,
      p_limit: r.limit,
      p_window_seconds: r.windowSeconds,
    })
    if (error || !data?.[0]) {
      console.error('[rate-limit] hit_rate_limit a échoué (fail-open)', error)
      continue
    }
    if (!data[0].allowed) {
      return { ok: false, retryAfter: data[0].retry_after }
    }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `pnpm --filter @goutatou/web test -- rate-limit-enforce`
Expected: PASS — 3/3.

- [ ] **Step 5: Câbler dans la route**

Modify `apps/web/src/app/api/lp/[slug]/order/route.ts`. Ajouter l'import et
insérer le bloc rate-limit **après** `validateWebOrder` (on a le `phone` validé)
et **avant** `createAdminClient()`/lookup resto.

Nouvel import (avec les autres imports `@/lib/...`) :
```ts
import { clientIp, orderRateKeys, enforceRateLimit } from '@/lib/rate-limit'
```

Remplacer le bloc :
```ts
  const v = validateWebOrder(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload

  const db = createAdminClient()
```
par :
```ts
  const v = validateWebOrder(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload

  const db = createAdminClient()

  // Rate-limit avant toute écriture (customer / create_order / WhatsApp).
  const rl = await enforceRateLimit(db, orderRateKeys(slug, p.phone, clientIp(req.headers)))
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Trop de commandes. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }
```
(`const db = createAdminClient()` reste à sa place d'origine — le bloc rate-limit
est simplement inséré juste après, avant le lookup resto. Ne pas dupliquer la
déclaration de `db`.)

- [ ] **Step 6: Typecheck + suite web complète**

Run: `pnpm --filter @goutatou/web typecheck && pnpm --filter @goutatou/web test`
Expected: typecheck clean ; toute la suite verte (helpers rate-limit inclus).

- [ ] **Step 7: Build (garde-fou bundle)**

Run: `pnpm --filter @goutatou/web build`
Expected: build OK, route `/api/lp/[slug]/order` présente. (Le module rate-limit
n'est importé que par la route nodejs — aucun risque de fuite crypto client.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/rate-limit.ts apps/web/src/app/api/lp/[slug]/order/route.ts apps/web/test/rate-limit-enforce.test.ts
git commit -m "feat(web): rate-limit 3 couches sur POST /api/lp/[slug]/order (429 + Retry-After)"
```

---

### Task 4: Déploiement + application migration prod

**Files:**
- Modify: `.env.example` (documentation — aucune nouvelle variable, note explicative)
- Modify: `docs/deploiement.md` (note migration 0013)

**Interfaces:**
- Consumes: migration 0013 (Task 1), code mergé (Tasks 2-3).
- Produces: rate-limit actif en prod.

- [ ] **Step 1: Documenter (pas de nouvelle env)**

Ajouter dans `docs/deploiement.md` une ligne sous la section migrations :
`0013_rate_limit — rate-limiting endpoint commande web (à appliquer avant publication d'une LP publique).`
(Confirmer verbatim la section existante avant d'éditer ; ne pas inventer de structure.)

- [ ] **Step 2: Merger la branche dans main**

```bash
git checkout main && git merge --ff-only <branche> && git push origin main
```
(Netlify auto-deploy déclenché.)

- [ ] **Step 3: Appliquer la migration 0013 en prod**

Via MCP Supabase si reconnecté (`apply_migration`), sinon fournir le SQL de
`20260709000013_rate_limit.sql` à coller dans le SQL Editor Supabase (projet
`vaowvldazfcmietacctz`). Vérifier ensuite :
```sql
select allowed, retry_after from hit_rate_limit('deploy-check', 1, 60); -- allowed=t
select allowed from hit_rate_limit('deploy-check', 1, 60);              -- allowed=f
```

- [ ] **Step 4: Vérifier l'advisor sécurité**

Via MCP Supabase `get_advisors` (security) : confirmer qu'aucun nouvel avis
critique n'apparaît sur `rate_limit_hits` / `hit_rate_limit` (fonction
security-definer service-role-only = pattern déjà accepté). Consigner.

- [ ] **Step 5: Smoke test prod (best-effort)**

Après déploiement Netlify, contre une LP publiée (ou en attente de publication) :
envoyer > limite de POST rapides sur `/api/lp/<slug>/order` avec le même numéro →
attendre un `429` + header `Retry-After`. Si aucune LP publiée, consigner comme
non testable et cocher au premier smoke test réel.

---

## Notes d'exécution

- Ordre des tâches strict : 1 (SQL) → 2 (helpers) → 3 (orchestrateur+route) → 4 (déploiement).
- La branche : `feature/rate-limit-commande`.
- Revue finale de branche (opus) avant merge, comme les phases précédentes.
