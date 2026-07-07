# Goutatou Phase 1 (Socle) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le socle vendable de Goutatou : schéma Supabase multi-tenant + RLS, service bot WhatsApp Whapi multi-canal (flow commande complet, drive inclus), dashboard resto temps réel (commandes + menu), admin onboarding minimal, déployé sur Railway + Netlify.

**Architecture:** Monorepo pnpm. `services/whatsapp` (Express/TS sur Railway) reçoit les webhooks Whapi routés par UUID de canal, fait tourner une machine à états **pure** persistée en Postgres, crée les commandes via une fonction SQL atomique, et notifie les clients via Supabase Realtime. `apps/web` (Next.js 15 sur Netlify) porte le dashboard resto (`/app`) et l'admin plateforme (`/admin`). `packages/db` (types + crypto + clients Supabase) et `packages/whapi` (client REST Whapi) sont partagés.

**Tech Stack:** pnpm 9 workspaces · TypeScript 5 strict · Node 20 · Express 4 · Next.js 15 (App Router) · Supabase (Postgres 15, Auth, Realtime, Storage) · Vitest + Supertest · pgTAP (`supabase test db`) · Tailwind CSS.

## Global Constraints

- Node ≥ 20, pnpm ≥ 9, TypeScript `"strict": true` partout.
- Textes du bot et de l'UI **en français** ; prix en **FCFA entiers** (pas de décimales).
- Chat IDs WhatsApp : toujours `<numéro>@s.whatsapp.net` ; on répond toujours au `chat_id` du webhook, jamais à `from`.
- Toujours ignorer les messages `from_me: true` (sinon boucle infinie).
- Le webhook répond **200 immédiatement** (< 5 s), traitement asynchrone ensuite.
- Pas de messages interactifs Whapi (boutons instables) : **menus numérotés en texte** uniquement.
- Envois Whapi : endpoint `https://gate.whapi.cloud`, header `Authorization: Bearer <token>`, paramètre `to` (jamais `chat_id`), corps texte dans `body`.
- Jamais de polling `getMessages` : webhooks uniquement.
- Tokens Whapi chiffrés AES-256-GCM en base (clé env `TOKEN_ENCRYPTION_KEY`, 64 hex chars).
- Toute table métier porte `restaurant_id` + RLS activée.
- Secrets uniquement via env ; `.env*` gitignorés ; `.env.example` à jour à chaque nouvelle variable.
- Commits fréquents, préfixes `feat:`/`chore:`/`test:`/`docs:`.

## File Structure (cible fin de phase 1)

```
goutatou/
├── package.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore  .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260707000001_core_schema.sql
│   │   ├── 20260707000002_rls.sql
│   │   └── 20260707000003_create_order_fn.sql
│   └── tests/database/
│       ├── 01_schema.test.sql
│       └── 02_rls_isolation.test.sql
├── packages/db/            # types métier + crypto + clients supabase
│   ├── package.json  tsconfig.json  vitest.config.ts
│   └── src/{types.ts, crypto.ts, client.ts, index.ts}
│   └── test/crypto.test.ts
├── packages/whapi/         # client REST Whapi partagé (service + admin web)
│   ├── package.json  tsconfig.json  vitest.config.ts
│   └── src/client.ts   test/client.test.ts
├── services/whatsapp/      # bot Express (Railway)
│   ├── package.json  tsconfig.json  vitest.config.ts  Dockerfile
│   └── src/
│   │   ├── index.ts  app.ts  config.ts
│   │   ├── bot/{machine.ts, copy.ts}
│   │   ├── repo.ts          # accès DB (canaux, clients, conversations, commandes)
│   │   ├── processor.ts     # webhook → machine → effets → réponses
│   │   └── notifier.ts      # Realtime orders → notifications client
│   └── test/{app.test.ts, machine.test.ts, machine-order.test.ts, processor.test.ts, notifier.test.ts}
└── apps/web/               # Next.js 15 (Netlify)
    ├── package.json  tsconfig.json  next.config.ts  middleware.ts  tailwind.config.ts  postcss.config.mjs
    └── src/
        ├── lib/supabase/{server.ts, admin.ts}
        ├── lib/orders.ts        # helpers purs kanban (testés)
        ├── app/{layout.tsx, globals.css, login/page.tsx, login/actions.ts}
        ├── app/app/{layout.tsx, commandes/{page.tsx, board.tsx, actions.ts}, menu/{page.tsx, actions.ts}}
        └── app/admin/{layout.tsx, page.tsx, actions.ts}
```

---

### Task 1: Scaffold du monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: workspaces `packages/*`, `services/*`, `apps/*` ; `tsconfig.base.json` étendu par tous les paquets.

- [ ] **Step 1: Créer les fichiers racine**

`package.json` :
```json
{
  "name": "goutatou",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "packageManager": "pnpm@9.15.0"
}
```

`pnpm-workspace.yaml` :
```yaml
packages:
  - "packages/*"
  - "services/*"
  - "apps/*"
```

`tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.gitignore` :
```
node_modules/
dist/
.next/
.env
.env.*
!.env.example
supabase/.temp/
.DS_Store
```

`.env.example` :
```
# Supabase (projet vaowvldazfcmietacctz)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Chiffrement des tokens Whapi (32 octets hex : openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=
# Service bot
PORT=8080
PUBLIC_WEBHOOK_BASE_URL=
```

- [ ] **Step 2: Vérifier l'installation**

Run: `pnpm install`
Expected: `Done` sans erreur (lockfile créé).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold monorepo pnpm (workspaces, tsconfig, env example)"
```

---

### Task 2: Schéma Postgres core (migration 0001)

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/20260707000001_core_schema.sql`
- Test: `supabase/tests/database/01_schema.test.sql`

**Interfaces:**
- Produces: tables `restaurants`, `platform_admins`, `restaurant_members`, `whapi_channels`, `menu_categories`, `menu_items`, `customers`, `conversations`, `orders`, `order_items`, `drive_slots`, `message_logs`, `subscriptions` ; enums `order_mode`, `order_status`, `order_source`. Toutes consommées par les tâches 3, 4, 9, 10.

- [ ] **Step 1: Initialiser Supabase local**

Run: `supabase init` (répondre non aux options VS Code/Deno), puis `supabase start`
Expected: conteneurs démarrés, URL API locale affichée. (Prérequis : Docker + Supabase CLI ≥ 1.200.)

- [ ] **Step 2: Écrire le test pgTAP d'existence du schéma (échoue d'abord)**

`supabase/tests/database/01_schema.test.sql` :
```sql
begin;
select plan(14);
select has_table('public', 'restaurants', 'restaurants existe');
select has_table('public', 'platform_admins', 'platform_admins existe');
select has_table('public', 'restaurant_members', 'restaurant_members existe');
select has_table('public', 'whapi_channels', 'whapi_channels existe');
select has_table('public', 'menu_categories', 'menu_categories existe');
select has_table('public', 'menu_items', 'menu_items existe');
select has_table('public', 'customers', 'customers existe');
select has_table('public', 'conversations', 'conversations existe');
select has_table('public', 'orders', 'orders existe');
select has_table('public', 'order_items', 'order_items existe');
select has_table('public', 'drive_slots', 'drive_slots existe');
select has_table('public', 'message_logs', 'message_logs existe');
select has_table('public', 'subscriptions', 'subscriptions existe');
select has_type('order_status', 'enum order_status existe');
select * from finish();
rollback;
```

- [ ] **Step 3: Vérifier que le test échoue**

Run: `supabase test db`
Expected: FAIL (tables absentes).

- [ ] **Step 4: Écrire la migration**

`supabase/migrations/20260707000001_core_schema.sql` :
```sql
create extension if not exists pgtap with schema extensions;

create type order_mode as enum ('drive', 'livraison', 'sur_place');
create type order_status as enum ('recue', 'en_preparation', 'prete', 'recuperee', 'annulee');
create type order_source as enum ('whatsapp', 'web');

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  branding jsonb not null default '{}',
  lp_config jsonb not null default '{}',
  timezone text not null default 'Africa/Libreville',
  drive_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table restaurant_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  primary key (user_id, restaurant_id)
);

create table whapi_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  channel_id text,
  phone text,
  token_encrypted text not null,
  status text not null default 'active' check (status in ('active', 'error')),
  last_webhook_at timestamptz,
  created_at timestamptz not null default now()
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price int not null check (price >= 0),
  photo_url text,
  available boolean not null default true,
  position int not null default 0
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  phone text not null,
  chat_id text not null,
  name text,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  state text not null default 'ACCUEIL',
  cart jsonb not null default '{"items": []}',
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_id)
);

create table drive_slots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  position int not null default 0,
  active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id),
  source order_source not null default 'whatsapp',
  mode order_mode not null,
  status order_status not null default 'recue',
  drive_slot_id uuid references drive_slots(id),
  delivery_address text,
  total int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_restaurant_status_idx on orders (restaurant_id, status, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  name text not null,
  unit_price int not null,
  qty int not null check (qty > 0)
);

create table message_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  whapi_message_id text unique,
  chat_id text not null,
  body text,
  error text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'premium')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  created_at timestamptz not null default now()
);

-- Realtime : le dashboard écoute orders ; le notifier a besoin de l'ancienne valeur de status
alter publication supabase_realtime add table orders;
alter table orders replica identity full;
```

- [ ] **Step 5: Appliquer et vérifier**

Run: `supabase db reset && supabase test db`
Expected: `01_schema.test.sql .. ok`, 14/14 PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase && git commit -m "feat(db): schéma core multi-tenant (migration 0001) + tests pgTAP"
```

---

### Task 3: RLS multi-tenant (migration 0002)

**Files:**
- Create: `supabase/migrations/20260707000002_rls.sql`
- Test: `supabase/tests/database/02_rls_isolation.test.sql`

**Interfaces:**
- Consumes: tables de la Task 2.
- Produces: fonctions SQL `is_member(uuid)` et `is_platform_admin()` ; RLS active sur toutes les tables métier. Le dashboard (Task 12+) repose dessus.

- [ ] **Step 1: Écrire le test pgTAP d'isolation (échoue d'abord)**

`supabase/tests/database/02_rls_isolation.test.sql` :
```sql
begin;
select plan(4);

-- Deux restos, deux users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.io'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.io');
insert into restaurants (id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'resto-a', 'Resto A'),
  ('10000000-0000-0000-0000-000000000002', 'resto-b', 'Resto B');
insert into restaurant_members (user_id, restaurant_id) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002');
insert into orders (restaurant_id, customer_id, mode, total)
select r.id, c.id, 'sur_place', 1000 from restaurants r
cross join lateral (
  insert into customers (restaurant_id, phone, chat_id)
  values (r.id, '241000' || r.slug, '241000' || r.slug || '@s.whatsapp.net')
  returning id
) c;

-- User A ne voit que le resto A
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select results_eq('select count(*)::int from restaurants', array[1], 'A voit 1 restaurant');
select results_eq('select count(*)::int from orders', array[1], 'A voit 1 commande');
select results_eq(
  $$select count(*)::int from restaurants where slug = 'resto-b'$$, array[0],
  'A ne voit pas le resto B');

-- Anonyme ne voit rien
set local role anon;
set local request.jwt.claims to '{}';
select results_eq('select count(*)::int from restaurants', array[0], 'anon ne voit rien');

select * from finish();
rollback;
```

- [ ] **Step 2: Vérifier l'échec**

Run: `supabase test db`
Expected: `02_rls_isolation` FAIL (RLS pas encore activée → A voit 2 restaurants).

- [ ] **Step 3: Écrire la migration RLS**

`supabase/migrations/20260707000002_rls.sql` :
```sql
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function is_member(p_restaurant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurant_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id
  ) or is_platform_admin();
$$;

alter table restaurants enable row level security;
alter table platform_admins enable row level security;
alter table restaurant_members enable row level security;
alter table whapi_channels enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table customers enable row level security;
alter table conversations enable row level security;
alter table drive_slots enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table message_logs enable row level security;
alter table subscriptions enable row level security;

create policy restaurants_select on restaurants for select using (is_member(id));
create policy restaurants_admin_all on restaurants for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy members_select on restaurant_members for select
  using (user_id = auth.uid() or is_platform_admin());
create policy members_admin_all on restaurant_members for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy admins_self on platform_admins for select using (user_id = auth.uid());

-- Tables métier : membres du tenant (lecture/écriture), admin plateforme inclus via is_member
create policy tenant_all_whapi on whapi_channels for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_cat on menu_categories for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_items on menu_items for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_customers on customers for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_conv on conversations for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_slots on drive_slots for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_orders on orders for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_oitems on order_items for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_logs on message_logs for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
create policy tenant_all_subs on subscriptions for select using (is_member(restaurant_id));
create policy subs_admin_all on subscriptions for all
  using (is_platform_admin()) with check (is_platform_admin());
```

- [ ] **Step 4: Vérifier le pass**

Run: `supabase db reset && supabase test db`
Expected: 01 et 02 PASS (4/4 sur l'isolation).

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat(db): RLS multi-tenant + is_member/is_platform_admin (migration 0002)"
```

---

### Task 4: Fonction SQL `create_order` atomique (migration 0003)

**Files:**
- Create: `supabase/migrations/20260707000003_create_order_fn.sql`
- Test: `supabase/tests/database/03_create_order.test.sql`

**Interfaces:**
- Produces: `create_order(p_restaurant_id uuid, p_customer_id uuid, p_source order_source, p_mode order_mode, p_items jsonb, p_drive_slot_id uuid, p_delivery_address text) returns table (order_id uuid, order_number bigint, total int)`. `p_items` = `[{"menu_item_id": "<uuid>", "qty": 2}]`. Les prix sont relus depuis `menu_items` (on ne fait pas confiance au panier). Consommée par `repo.ts` (Task 9).

- [ ] **Step 1: Test pgTAP (échoue d'abord)**

`supabase/tests/database/03_create_order.test.sql` :
```sql
begin;
select plan(3);

insert into restaurants (id, slug, name) values ('20000000-0000-0000-0000-000000000001', 'resto-t', 'Resto T');
insert into menu_categories (id, restaurant_id, name)
  values ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Plats');
insert into menu_items (id, restaurant_id, category_id, name, price)
  values ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000002', 'Bo Bun', 4500);
insert into customers (id, restaurant_id, phone, chat_id)
  values ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
          '24177000001', '24177000001@s.whatsapp.net');

select results_eq(
  $$select total from create_order(
      '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
      'whatsapp', 'sur_place',
      '[{"menu_item_id": "20000000-0000-0000-0000-000000000003", "qty": 2}]'::jsonb,
      null, null)$$,
  array[9000], 'total = 2 x 4500');
select results_eq('select count(*)::int from orders', array[1], '1 commande créée');
select results_eq('select qty from order_items', array[2], 'ligne qty 2');

select * from finish();
rollback;
```

- [ ] **Step 2: Vérifier l'échec**

Run: `supabase test db` — Expected: FAIL `function create_order(...) does not exist`.

- [ ] **Step 3: Migration**

`supabase/migrations/20260707000003_create_order_fn.sql` :
```sql
create or replace function create_order(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_source order_source,
  p_mode order_mode,
  p_items jsonb,
  p_drive_slot_id uuid default null,
  p_delivery_address text default null
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_total int;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  insert into orders (restaurant_id, customer_id, source, mode, drive_slot_id, delivery_address)
  values (p_restaurant_id, p_customer_id, p_source, p_mode, p_drive_slot_id, p_delivery_address)
  returning * into v_order;

  insert into order_items (order_id, restaurant_id, menu_item_id, name, unit_price, qty)
  select v_order.id, p_restaurant_id, mi.id, mi.name, mi.price, (it->>'qty')::int
  from jsonb_array_elements(p_items) it
  join menu_items mi on mi.id = (it->>'menu_item_id')::uuid
    and mi.restaurant_id = p_restaurant_id and mi.available;

  select coalesce(sum(unit_price * qty), 0) into v_total
  from order_items where order_items.order_id = v_order.id;

  if v_total = 0 then
    raise exception 'no_valid_items';
  end if;

  update orders set total = v_total where id = v_order.id;
  return query select v_order.id, v_order.order_number, v_total;
end;
$$;
```

- [ ] **Step 4: Vérifier le pass** — Run: `supabase db reset && supabase test db` — Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat(db): fonction create_order atomique (migration 0003)"
```

---

### Task 5: `packages/db` — types métier, crypto AES-256-GCM, clients Supabase

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`, `packages/db/src/{types.ts, crypto.ts, client.ts, index.ts}`
- Test: `packages/db/test/crypto.test.ts`

**Interfaces:**
- Produces (importés via `@goutatou/db` par toutes les tâches suivantes) :
  - `type OrderMode = 'drive' | 'livraison' | 'sur_place'` ; `type OrderStatus = 'recue' | 'en_preparation' | 'prete' | 'recuperee' | 'annulee'` ; `type BotState = 'ACCUEIL' | 'MENU' | 'MODE' | 'CRENEAU' | 'ADRESSE' | 'CONFIRMATION' | 'HUMAIN'`
  - `interface CartItem { menuItemId: string; name: string; unitPrice: number; qty: number }`
  - `interface Cart { items: CartItem[]; mode?: OrderMode; driveSlotId?: string; driveSlotLabel?: string; address?: string }`
  - `interface MenuForBot { categories: { name: string; items: { id: string; name: string; price: number }[] }[] }`
  - `encryptToken(plain: string, keyHex: string): string` / `decryptToken(payload: string, keyHex: string): string`
  - `createServiceClient(url: string, serviceRoleKey: string): SupabaseClient`

- [ ] **Step 1: Créer le paquet**

`packages/db/package.json` :
```json
{
  "name": "@goutatou/db",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@supabase/supabase-js": "^2.47.0" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

`packages/db/tsconfig.json` :
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/db/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 2: Test crypto (échoue d'abord)**

`packages/db/test/crypto.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from '../src/crypto.js'

const KEY = 'a'.repeat(64) // 32 octets hex

describe('crypto tokens Whapi', () => {
  it('chiffre puis déchiffre à l’identique', () => {
    const enc = encryptToken('whapi-secret-token', KEY)
    expect(enc).not.toContain('whapi-secret-token')
    expect(decryptToken(enc, KEY)).toBe('whapi-secret-token')
  })
  it('produit un chiffré différent à chaque appel (IV aléatoire)', () => {
    expect(encryptToken('x', KEY)).not.toBe(encryptToken('x', KEY))
  })
  it('rejette une clé de mauvaise taille', () => {
    expect(() => encryptToken('x', 'abcd')).toThrow()
  })
  it('rejette un payload falsifié (auth tag GCM)', () => {
    const enc = encryptToken('x', KEY)
    const tampered = enc.slice(0, -4) + (enc.endsWith('aaaa') ? 'bbbb' : 'aaaa')
    expect(() => decryptToken(tampered, KEY)).toThrow()
  })
})
```

- [ ] **Step 3: Vérifier l'échec** — Run: `pnpm --filter @goutatou/db test` — Expected: FAIL (module `crypto.js` absent).

- [ ] **Step 4: Implémenter**

`packages/db/src/crypto.ts` :
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(keyHex: string): Buffer {
  const buf = Buffer.from(keyHex, 'hex')
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY doit faire 32 octets hex (64 caractères)')
  return buf
}

/** Format de sortie : base64(iv[12]) . base64(tag[16]) . base64(ciphertext), séparés par ':' */
export function encryptToken(plain: string, keyHex: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(keyHex), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decryptToken(payload: string, keyHex: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('payload chiffré invalide')
  const decipher = createDecipheriv('aes-256-gcm', key(keyHex), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
```

`packages/db/src/types.ts` :
```ts
export type OrderMode = 'drive' | 'livraison' | 'sur_place'
export type OrderStatus = 'recue' | 'en_preparation' | 'prete' | 'recuperee' | 'annulee'
export type BotState = 'ACCUEIL' | 'MENU' | 'MODE' | 'CRENEAU' | 'ADRESSE' | 'CONFIRMATION' | 'HUMAIN'

export interface CartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
}

export interface Cart {
  items: CartItem[]
  mode?: OrderMode
  driveSlotId?: string
  driveSlotLabel?: string
  address?: string
}

export interface MenuForBot {
  categories: { name: string; items: { id: string; name: string; price: number }[] }[]
}

export const EMPTY_CART: Cart = { items: [] }

export function cartTotal(cart: Cart): number {
  return cart.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
}

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`
}
```

`packages/db/src/client.ts` :
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Client service_role — UNIQUEMENT côté serveur (bot, server actions). Bypasse la RLS. */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

`packages/db/src/index.ts` :
```ts
export * from './types.js'
export * from './crypto.js'
export * from './client.js'
```

- [ ] **Step 5: Vérifier le pass** — Run: `pnpm --filter @goutatou/db test` — Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db pnpm-lock.yaml && git commit -m "feat(db): types métier, crypto AES-256-GCM, client service Supabase"
```

---

### Task 6: `packages/whapi` — client REST Whapi avec retry

**Files:**
- Create: `packages/whapi/package.json`, `packages/whapi/tsconfig.json`, `packages/whapi/vitest.config.ts`, `packages/whapi/src/client.ts`
- Test: `packages/whapi/test/client.test.ts`

**Interfaces:**
- Produces (`@goutatou/whapi`) :
  - `class WhapiClient { constructor(token: string, opts?: { baseUrl?: string; fetchFn?: typeof fetch; retryDelayMs?: number }) }`
  - `sendText(to: string, body: string): Promise<{ id?: string }>` — POST `/messages/text`, retry x3 backoff sur 5xx/réseau, throw `WhapiError` sinon.
  - `sendImage(to: string, mediaUrl: string, caption?: string): Promise<{ id?: string }>` — POST `/messages/image` avec `{ to, media: mediaUrl, caption }`.
  - `setWebhook(url: string): Promise<void>` — PATCH `/settings` avec `{ webhooks: [{ mode: 'body', events: [{type:'messages',method:'post'}], url }] }`.
  - `checkHealth(): Promise<boolean>` — GET `/health`, true si 2xx.
  - `class WhapiError extends Error { status?: number }`

- [ ] **Step 1: Créer le paquet**

`packages/whapi/package.json` :
```json
{
  "name": "@goutatou/whapi",
  "version": "0.0.1",
  "type": "module",
  "main": "src/client.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

`packages/whapi/tsconfig.json` : identique à `packages/db/tsconfig.json`.
`packages/whapi/vitest.config.ts` : identique à `packages/db/vitest.config.ts`.

- [ ] **Step 2: Tests (échouent d'abord)**

`packages/whapi/test/client.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest'
import { WhapiClient, WhapiError } from '../src/client.js'

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body ?? {}), { status: r.status }))
  }
  return fn
}

describe('WhapiClient', () => {
  it('envoie un texte avec le bon endpoint, header et body', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'MSG1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendText('24177000001@s.whatsapp.net', 'Bonjour')
    expect(res.id).toBe('MSG1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/text')
    expect(init.headers['Authorization']).toBe('Bearer tok123')
    expect(JSON.parse(init.body)).toEqual({ to: '24177000001@s.whatsapp.net', body: 'Bonjour' })
  })

  it('retry sur 500 puis succès', async () => {
    const fetchFn = mockFetch([{ status: 500 }, { status: 200, body: { message: { id: 'M2' } } }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendText('x@s.whatsapp.net', 'y')
    expect(res.id).toBe('M2')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('échoue immédiatement sur 401 (pas de retry) avec WhapiError', async () => {
    const fetchFn = mockFetch([{ status: 401 }])
    const client = new WhapiClient('bad', { fetchFn, retryDelayMs: 0 })
    await expect(client.sendText('x@s.whatsapp.net', 'y')).rejects.toBeInstanceOf(WhapiError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('abandonne après 3 tentatives sur 5xx', async () => {
    const fetchFn = mockFetch([{ status: 502 }, { status: 502 }, { status: 502 }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    await expect(client.sendText('x@s.whatsapp.net', 'y')).rejects.toBeInstanceOf(WhapiError)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('configure le webhook au format Whapi exact', async () => {
    const fetchFn = mockFetch([{ status: 200 }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    await client.setWebhook('https://bot.example.com/hook/abc')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/settings')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({
      webhooks: [{ mode: 'body', events: [{ type: 'messages', method: 'post' }], url: 'https://bot.example.com/hook/abc' }],
    })
  })
})
```

- [ ] **Step 3: Vérifier l'échec** — Run: `pnpm --filter @goutatou/whapi test` — Expected: FAIL.

- [ ] **Step 4: Implémenter**

`packages/whapi/src/client.ts` :
```ts
export class WhapiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'WhapiError'
  }
}

interface Opts {
  baseUrl?: string
  fetchFn?: typeof fetch
  retryDelayMs?: number
}

const MAX_ATTEMPTS = 3

export class WhapiClient {
  private baseUrl: string
  private fetchFn: typeof fetch
  private retryDelayMs: number

  constructor(private token: string, opts: Opts = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://gate.whapi.cloud'
    this.fetchFn = opts.fetchFn ?? fetch
    this.retryDelayMs = opts.retryDelayMs ?? 500
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** (attempt - 1)))
      try {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (res.ok) return res.json().catch(() => ({}))
        if (res.status >= 500) {
          lastError = new WhapiError(`Whapi ${res.status} sur ${path}`, res.status)
          continue // retry sur 5xx uniquement
        }
        throw new WhapiError(`Whapi ${res.status} sur ${path}`, res.status)
      } catch (err) {
        if (err instanceof WhapiError && err.status !== undefined && err.status < 500) throw err
        lastError = err // erreur réseau → retry
      }
    }
    throw lastError instanceof Error ? lastError : new WhapiError('échec réseau Whapi')
  }

  async sendText(to: string, body: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/text', { to, body })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }

  async sendImage(to: string, mediaUrl: string, caption?: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/image', { to, media: mediaUrl, caption })) as {
      message?: { id?: string }
    }
    return { id: res.message?.id }
  }

  async setWebhook(url: string): Promise<void> {
    await this.request('PATCH', '/settings', {
      webhooks: [{ mode: 'body', events: [{ type: 'messages', method: 'post' }], url }],
    })
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.request('GET', '/health')
      return true
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 5: Vérifier le pass** — Run: `pnpm --filter @goutatou/whapi test` — Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/whapi pnpm-lock.yaml && git commit -m "feat(whapi): client REST avec retry/backoff et config webhook"
```

---

### Task 7: Scaffold du service bot (Express + health)

**Files:**
- Create: `services/whatsapp/package.json`, `services/whatsapp/tsconfig.json`, `services/whatsapp/vitest.config.ts`, `services/whatsapp/src/{config.ts, app.ts, index.ts}`, `services/whatsapp/Dockerfile`
- Test: `services/whatsapp/test/app.test.ts`

**Interfaces:**
- Produces: `createApp(deps: AppDeps): express.Express` où `AppDeps = { processWebhook: (channelUuid: string, payload: unknown) => Promise<void> }` — la Task 10 branche le vrai processor. `GET /health` → `{ ok: true }`. `POST /hook/:channelUuid` → 200 immédiat.

- [ ] **Step 1: Créer le paquet**

`services/whatsapp/package.json` :
```json
{
  "name": "@goutatou/service-whatsapp",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@goutatou/db": "workspace:*",
    "@goutatou/whapi": "workspace:*",
    "@supabase/supabase-js": "^2.47.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`services/whatsapp/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`services/whatsapp/vitest.config.ts` : identique à `packages/db/vitest.config.ts`.

- [ ] **Step 2: Test (échoue d'abord)**

`services/whatsapp/test/app.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('app', () => {
  it('GET /health répond ok', async () => {
    const app = createApp({ processWebhook: vi.fn() })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('POST /hook/:channelUuid répond 200 immédiatement et délègue au processor', async () => {
    const processWebhook = vi.fn().mockResolvedValue(undefined)
    const app = createApp({ processWebhook })
    const res = await request(app).post('/hook/chan-1').send({ messages: [] })
    expect(res.status).toBe(200)
    expect(processWebhook).toHaveBeenCalledWith('chan-1', { messages: [] })
  })

  it('répond 200 même si le processor rejette (jamais de 500 vers Whapi)', async () => {
    const processWebhook = vi.fn().mockRejectedValue(new Error('boom'))
    const app = createApp({ processWebhook })
    const res = await request(app).post('/hook/chan-1').send({ messages: [] })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test` — Expected: FAIL.

- [ ] **Step 4: Implémenter**

`services/whatsapp/src/config.ts` :
```ts
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

export function loadConfig() {
  return {
    port: Number(process.env.PORT ?? 8080),
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenKey: required('TOKEN_ENCRYPTION_KEY'),
  }
}
export type Config = ReturnType<typeof loadConfig>
```

`services/whatsapp/src/app.ts` :
```ts
import express from 'express'

export interface AppDeps {
  processWebhook: (channelUuid: string, payload: unknown) => Promise<void>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.post('/hook/:channelUuid', (req, res) => {
    // 200 immédiat : Whapi attend une réponse < 5 s ; le traitement est asynchrone.
    res.status(200).json({ status: 'ok' })
    deps.processWebhook(req.params.channelUuid, req.body).catch((err) => {
      console.error('[webhook] traitement échoué', err)
    })
  })

  return app
}
```

`services/whatsapp/src/index.ts` :
```ts
import { loadConfig } from './config.js'
import { createApp } from './app.js'

const config = loadConfig()
// Le vrai processor est branché en Task 10 ; stub temporaire pour démarrer le service.
const app = createApp({ processWebhook: async () => {} })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
```

`services/whatsapp/Dockerfile` :
```dockerfile
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @goutatou/service-whatsapp... build

FROM node:20-slim
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo .
ENV NODE_ENV=production
CMD ["node", "services/whatsapp/dist/index.js"]
```

- [ ] **Step 5: Vérifier le pass** — Run: `pnpm install && pnpm --filter @goutatou/service-whatsapp test` — Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/whatsapp pnpm-lock.yaml && git commit -m "feat(bot): scaffold Express, /health, /hook/:channelUuid (200 immédiat)"
```

---

### Task 8: Machine à états — accueil, menu, panier

**Files:**
- Create: `services/whatsapp/src/bot/copy.ts`, `services/whatsapp/src/bot/machine.ts`
- Test: `services/whatsapp/test/machine.test.ts`

**Interfaces:**
- Consumes: `Cart`, `CartItem`, `BotState`, `MenuForBot`, `cartTotal`, `formatFcfa`, `EMPTY_CART` de `@goutatou/db`.
- Produces:
  - `interface BotContext { restaurantName: string; menu: MenuForBot; driveEnabled: boolean; driveSlots: { id: string; label: string }[] }`
  - `interface TransitionResult { state: BotState; cart: Cart; replies: string[]; createOrder?: boolean }`
  - `transition(state: BotState, cart: Cart, input: string, ctx: BotContext): TransitionResult` — fonction **pure**, aucun IO.
  - `renderMenu(ctx: BotContext): string` et `flatMenuItems(menu: MenuForBot): { id: string; name: string; price: number }[]` (numérotation globale 1..n dans l'ordre des catégories).

- [ ] **Step 1: Tests (échouent d'abord)**

`services/whatsapp/test/machine.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, renderMenu, type BotContext } from '../src/bot/machine.js'

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: {
    categories: [
      { name: 'Plats', items: [
        { id: 'item-bobun', name: 'Bo Bun', price: 4500 },
        { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
      ]},
      { name: 'Boissons', items: [{ id: 'item-coca', name: 'Coca 33cl', price: 1000 }] },
    ],
  },
}

describe('renderMenu', () => {
  it('numérote les items en continu à travers les catégories', () => {
    const menu = renderMenu(ctx)
    expect(menu).toContain('*Plats*')
    expect(menu).toContain('1. Bo Bun — 4 500 FCFA')
    expect(menu).toContain('2. Nems (x4) — 2 500 FCFA')
    expect(menu).toContain('3. Coca 33cl — 1 000 FCFA')
  })
})

describe('transition — accueil et menu', () => {
  it('ACCUEIL: message inconnu → bienvenue + invite menu', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'bonjour', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies[0]).toContain('Chez Test')
    expect(r.replies[0]).toContain('*menu*')
  })

  it('"menu" depuis n’importe quel état → MENU avec la carte', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'Menu', ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('1. Bo Bun')
  })

  it('MENU: "1" ajoute 1 Bo Bun au panier', () => {
    const r = transition('MENU', EMPTY_CART, '1', ctx)
    expect(r.cart.items).toEqual([{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }])
    expect(r.replies[0]).toContain('Bo Bun')
    expect(r.replies[0]).toContain('*valider*')
  })

  it('MENU: "3x2" ajoute 2 Coca', () => {
    const r = transition('MENU', EMPTY_CART, '3x2', ctx)
    expect(r.cart.items[0]).toEqual({ menuItemId: 'item-coca', name: 'Coca 33cl', unitPrice: 1000, qty: 2 })
  })

  it('MENU: re-ajouter le même item incrémente la quantité', () => {
    const once = transition('MENU', EMPTY_CART, '1', ctx)
    const twice = transition('MENU', once.cart, '1', ctx)
    expect(twice.cart.items[0].qty).toBe(2)
  })

  it('MENU: numéro hors carte → message d’erreur, panier inchangé', () => {
    const r = transition('MENU', EMPTY_CART, '9', ctx)
    expect(r.cart.items).toHaveLength(0)
    expect(r.replies[0]).toContain('pas compris')
  })

  it('"panier" affiche le récap avec total', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2 }] }
    const r = transition('MENU', cart, 'panier', ctx)
    expect(r.replies[0]).toContain('2× Bo Bun')
    expect(r.replies[0]).toContain('9 000 FCFA')
  })

  it('"annuler" vide le panier et revient à ACCUEIL', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] }
    const r = transition('MODE', cart, 'annuler', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(0)
  })

  it('"humain" → HUMAIN (bot silencieux), "bot" reprend', () => {
    const r = transition('MENU', EMPTY_CART, 'humain', ctx)
    expect(r.state).toBe('HUMAIN')
    const silent = transition('HUMAIN', EMPTY_CART, 'bonjour ?', ctx)
    expect(silent.replies).toHaveLength(0)
    expect(silent.state).toBe('HUMAIN')
    const back = transition('HUMAIN', EMPTY_CART, 'bot', ctx)
    expect(back.state).toBe('ACCUEIL')
  })

  it('"valider" avec panier vide → invite à commander d’abord', () => {
    const r = transition('MENU', EMPTY_CART, 'valider', ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('panier est vide')
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- machine` — Expected: FAIL.

- [ ] **Step 3: Implémenter**

`services/whatsapp/src/bot/copy.ts` :
```ts
import { type Cart, cartTotal, formatFcfa } from '@goutatou/db'

export const copy = {
  welcome: (name: string) =>
    `Bienvenue chez ${name} ! 👋\nTapez *menu* pour voir la carte, ou *humain* pour parler à quelqu'un.`,
  menuFooter:
    `\nEnvoyez le *numéro* d'un plat pour l'ajouter (ex. *1* ou *1x2* pour 2 portions).\n` +
    `*panier* : voir votre commande · *valider* : passer commande · *annuler* : tout effacer`,
  added: (name: string, qty: number) =>
    `✅ ${qty}× ${name} ajouté au panier.\nAjoutez d'autres plats, ou tapez *valider* pour passer commande.`,
  notUnderstood: `Désolé, je n'ai pas compris 😅 Tapez *menu* pour voir la carte.`,
  emptyCart: `Votre panier est vide. Tapez *menu* pour voir la carte.`,
  cartRecap: (cart: Cart) => {
    const lines = cart.items.map((it) => `• ${it.qty}× ${it.name} — ${formatFcfa(it.unitPrice * it.qty)}`)
    return `🛒 *Votre panier*\n${lines.join('\n')}\n\n*Total : ${formatFcfa(cartTotal(cart))}*`
  },
  canceled: `Commande annulée. Tapez *menu* quand vous voulez recommencer. 👍`,
  human: `Un membre de l'équipe va vous répondre ici. Tapez *bot* pour reprendre la commande automatique.`,
  chooseMode: (options: string[]) =>
    `Comment souhaitez-vous récupérer votre commande ?\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
  chooseSlot: (slots: { label: string }[]) =>
    `🚗 Choisissez votre créneau de retrait :\n${slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}`,
  askAddress: `🛵 Indiquez votre adresse de livraison (quartier + repère) :`,
  confirm: (cart: Cart, modeLabel: string, detail?: string) =>
    `${copy.cartRecap(cart)}\n\nMode : ${modeLabel}${detail ? `\n${detail}` : ''}\n\n` +
    `1. ✅ Confirmer\n2. ❌ Annuler`,
}
```

`services/whatsapp/src/bot/machine.ts` :
```ts
import {
  EMPTY_CART,
  type BotState,
  type Cart,
  type MenuForBot,
  type OrderMode,
  formatFcfa,
} from '@goutatou/db'
import { copy } from './copy.js'

export interface BotContext {
  restaurantName: string
  menu: MenuForBot
  driveEnabled: boolean
  driveSlots: { id: string; label: string }[]
}

export interface TransitionResult {
  state: BotState
  cart: Cart
  replies: string[]
  createOrder?: boolean
}

export function flatMenuItems(menu: MenuForBot): { id: string; name: string; price: number }[] {
  return menu.categories.flatMap((c) => c.items)
}

export function renderMenu(ctx: BotContext): string {
  let index = 0
  const sections = ctx.menu.categories.map((cat) => {
    const rows = cat.items.map((it) => `${++index}. ${it.name} — ${formatFcfa(it.price)}`)
    return `*${cat.name}*\n${rows.join('\n')}`
  })
  return `🍽️ *Carte — ${ctx.restaurantName}*\n\n${sections.join('\n\n')}\n${copy.menuFooter}`
}

const MODE_DEFS: { mode: OrderMode; label: string }[] = [
  { mode: 'drive', label: '🚗 Drive (retrait sur créneau)' },
  { mode: 'livraison', label: '🛵 Livraison' },
  { mode: 'sur_place', label: '🍽️ Sur place' },
]

export function availableModes(ctx: BotContext): { mode: OrderMode; label: string }[] {
  return MODE_DEFS.filter((m) => m.mode !== 'drive' || ctx.driveEnabled)
}

function result(state: BotState, cart: Cart, replies: string[], createOrder?: boolean): TransitionResult {
  return { state, cart, replies, ...(createOrder ? { createOrder } : {}) }
}

/** Parse "3" ou "3x2" → { index: 3, qty: 2 } (1-based), sinon null. */
function parseItemInput(input: string): { index: number; qty: number } | null {
  const m = input.match(/^(\d{1,3})(?:\s*[xX*]\s*(\d{1,2}))?$/)
  if (!m) return null
  return { index: Number(m[1]), qty: m[2] ? Number(m[2]) : 1 }
}

function addToCart(cart: Cart, item: { id: string; name: string; price: number }, qty: number): Cart {
  const existing = cart.items.find((it) => it.menuItemId === item.id)
  const items = existing
    ? cart.items.map((it) => (it.menuItemId === item.id ? { ...it, qty: it.qty + qty } : it))
    : [...cart.items, { menuItemId: item.id, name: item.name, unitPrice: item.price, qty }]
  return { ...cart, items }
}

export function transition(state: BotState, cart: Cart, input: string, ctx: BotContext): TransitionResult {
  const text = input.trim().toLowerCase()

  // État HUMAIN : silence total sauf "bot"
  if (state === 'HUMAIN') {
    if (text === 'bot') return result('ACCUEIL', cart, [copy.welcome(ctx.restaurantName)])
    return result('HUMAIN', cart, [])
  }

  // Commandes globales
  if (text === 'menu') return result('MENU', cart, [renderMenu(ctx)])
  if (text === 'annuler') return result('ACCUEIL', EMPTY_CART, [copy.canceled])
  if (text === 'humain') return result('HUMAIN', cart, [copy.human])
  if (text === 'panier') {
    return result(state === 'ACCUEIL' ? 'MENU' : state, cart,
      [cart.items.length ? copy.cartRecap(cart) : copy.emptyCart])
  }

  switch (state) {
    case 'ACCUEIL':
      return result('ACCUEIL', cart, [copy.welcome(ctx.restaurantName)])

    case 'MENU': {
      if (text === 'valider') {
        if (!cart.items.length) return result('MENU', cart, [copy.emptyCart])
        const modes = availableModes(ctx)
        return result('MODE', cart, [copy.chooseMode(modes.map((m) => m.label))])
      }
      const parsed = parseItemInput(text)
      if (parsed) {
        const items = flatMenuItems(ctx.menu)
        const item = items[parsed.index - 1]
        if (item) {
          const next = addToCart(cart, item, parsed.qty)
          return result('MENU', next, [copy.added(item.name, parsed.qty)])
        }
      }
      return result('MENU', cart, [copy.notUnderstood])
    }

    case 'MODE': {
      const modes = availableModes(ctx)
      const idx = Number(text) - 1
      const chosen = Number.isInteger(idx) ? modes[idx] : undefined
      if (!chosen) return result('MODE', cart, [copy.chooseMode(modes.map((m) => m.label))])
      const next: Cart = { ...cart, mode: chosen.mode }
      if (chosen.mode === 'drive') {
        return result('CRENEAU', next, [copy.chooseSlot(ctx.driveSlots)])
      }
      if (chosen.mode === 'livraison') return result('ADRESSE', next, [copy.askAddress])
      return result('CONFIRMATION', next, [copy.confirm(next, chosen.label)])
    }

    case 'CRENEAU': {
      const idx = Number(text) - 1
      const slot = Number.isInteger(idx) ? ctx.driveSlots[idx] : undefined
      if (!slot) return result('CRENEAU', cart, [copy.chooseSlot(ctx.driveSlots)])
      const next: Cart = { ...cart, driveSlotId: slot.id, driveSlotLabel: slot.label }
      return result('CONFIRMATION', next, [
        copy.confirm(next, '🚗 Drive', `Créneau : ${slot.label}`),
      ])
    }

    case 'ADRESSE': {
      if (text.length < 5) return result('ADRESSE', cart, [copy.askAddress])
      const next: Cart = { ...cart, address: input.trim() }
      return result('CONFIRMATION', next, [
        copy.confirm(next, '🛵 Livraison', `Adresse : ${input.trim()}`),
      ])
    }

    case 'CONFIRMATION': {
      if (text === '1' || text === 'confirmer' || text === 'oui') {
        // Le processor crée la commande et envoie la confirmation avec le numéro.
        return result('ACCUEIL', cart, [], true)
      }
      if (text === '2' || text === 'non') return result('ACCUEIL', EMPTY_CART, [copy.canceled])
      const modeLabel = MODE_DEFS.find((m) => m.mode === cart.mode)?.label ?? ''
      return result('CONFIRMATION', cart, [copy.confirm(cart, modeLabel)])
    }
  }
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test -- machine` — Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp/src/bot services/whatsapp/test/machine.test.ts
git commit -m "feat(bot): machine à états pure — accueil, menu numéroté, panier, commandes globales"
```

---

### Task 9: Machine à états — mode, drive, adresse, confirmation

**Files:**
- Modify: rien (le code de la Task 8 couvre déjà ces états — cette tâche les **verrouille par des tests dédiés**)
- Test: `services/whatsapp/test/machine-order.test.ts`

**Interfaces:**
- Consumes: `transition`, `BotContext` (Task 8).

- [ ] **Step 1: Écrire les tests du flow complet**

`services/whatsapp/test/machine-order.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: { categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }] },
}
const cartWithItem: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] }

describe('flow drive complet', () => {
  it('valider → MODE avec 3 options (drive activé)', () => {
    const r = transition('MENU', cartWithItem, 'valider', ctx)
    expect(r.state).toBe('MODE')
    expect(r.replies[0]).toContain('1. 🚗 Drive')
    expect(r.replies[0]).toContain('3. 🍽️ Sur place')
  })

  it('MODE "1" (drive) → CRENEAU avec les créneaux', () => {
    const r = transition('MODE', cartWithItem, '1', ctx)
    expect(r.state).toBe('CRENEAU')
    expect(r.cart.mode).toBe('drive')
    expect(r.replies[0]).toContain('1. 12h00 – 12h15')
  })

  it('CRENEAU "2" → CONFIRMATION avec récap et créneau', () => {
    const r = transition('CRENEAU', { ...cartWithItem, mode: 'drive' }, '2', ctx)
    expect(r.state).toBe('CONFIRMATION')
    expect(r.cart.driveSlotId).toBe('slot-2')
    expect(r.replies[0]).toContain('Créneau : 12h15 – 12h30')
    expect(r.replies[0]).toContain('4 500 FCFA')
  })

  it('CONFIRMATION "1" → createOrder=true, retour ACCUEIL, panier conservé pour le processor', () => {
    const cart: Cart = { ...cartWithItem, mode: 'drive', driveSlotId: 'slot-2', driveSlotLabel: '12h15 – 12h30' }
    const r = transition('CONFIRMATION', cart, '1', ctx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(1) // le processor lit le panier PUIS le réinitialise
  })

  it('CONFIRMATION "2" → annulation, panier vidé', () => {
    const r = transition('CONFIRMATION', { ...cartWithItem, mode: 'drive' }, '2', ctx)
    expect(r.createOrder).toBeUndefined()
    expect(r.cart.items).toHaveLength(0)
  })
})

describe('flow livraison et sur place', () => {
  it('MODE "2" (livraison) → ADRESSE ; adresse valide → CONFIRMATION', () => {
    const r1 = transition('MODE', cartWithItem, '2', ctx)
    expect(r1.state).toBe('ADRESSE')
    const r2 = transition('ADRESSE', r1.cart, 'Quartier Glass, immeuble bleu', ctx)
    expect(r2.state).toBe('CONFIRMATION')
    expect(r2.cart.address).toBe('Quartier Glass, immeuble bleu')
  })

  it('ADRESSE trop courte → redemande', () => {
    const r = transition('ADRESSE', { ...cartWithItem, mode: 'livraison' }, 'ici', ctx)
    expect(r.state).toBe('ADRESSE')
  })

  it('MODE "3" (sur place) → CONFIRMATION directe', () => {
    const r = transition('MODE', cartWithItem, '3', ctx)
    expect(r.state).toBe('CONFIRMATION')
    expect(r.cart.mode).toBe('sur_place')
  })
})

describe('drive désactivé', () => {
  const noDriveCtx: BotContext = { ...ctx, driveEnabled: false }
  it('MODE ne propose que 2 options, "1" = livraison', () => {
    const r0 = transition('MENU', cartWithItem, 'valider', noDriveCtx)
    expect(r0.replies[0]).not.toContain('Drive')
    const r = transition('MODE', cartWithItem, '1', noDriveCtx)
    expect(r.cart.mode).toBe('livraison')
  })
})
```

- [ ] **Step 2: Lancer les tests**

Run: `pnpm --filter @goutatou/service-whatsapp test -- machine-order`
Expected: 9 tests PASS (si un test échoue, corriger `machine.ts` — c'est le contrat qui fait foi).

- [ ] **Step 3: Commit**

```bash
git add services/whatsapp/test/machine-order.test.ts
git commit -m "test(bot): flow complet drive/livraison/sur place jusqu'à la confirmation"
```

---

### Task 10: Repo DB + processor webhook (câblage complet)

**Files:**
- Create: `services/whatsapp/src/repo.ts`, `services/whatsapp/src/processor.ts`
- Modify: `services/whatsapp/src/index.ts`
- Test: `services/whatsapp/test/processor.test.ts`

**Interfaces:**
- Consumes: `transition`, `BotContext` (Task 8), `WhapiClient` (Task 6), `decryptToken`, `createServiceClient`, `Cart`, `EMPTY_CART` (Task 5), RPC `create_order` (Task 4).
- Produces:
  - `interface ChannelInfo { channelUuid: string; restaurantId: string; restaurantName: string; token: string; driveEnabled: boolean }`
  - `interface BotRepo { getChannel(channelUuid: string): Promise<ChannelInfo | null>; getBotContext(restaurantId: string, restaurantName: string, driveEnabled: boolean): Promise<BotContext>; upsertCustomer(restaurantId: string, phone: string, chatId: string, name?: string): Promise<{ id: string }>; loadConversation(restaurantId: string, customerId: string): Promise<{ state: BotState; cart: Cart }>; saveConversation(restaurantId: string, customerId: string, state: BotState, cart: Cart): Promise<void>; createOrder(restaurantId: string, customerId: string, cart: Cart): Promise<{ orderNumber: number; total: number }>; logMessage(restaurantId: string, direction: 'in' | 'out', chatId: string, body: string | null, whapiMessageId?: string, error?: string): Promise<boolean> }` — `logMessage` retourne `false` si `whapiMessageId` existe déjà (dédup idempotence).
  - `createProcessor(repo: BotRepo, makeWhapi: (token: string) => Pick<WhapiClient, 'sendText'>): (channelUuid: string, payload: unknown) => Promise<void>`

- [ ] **Step 1: Tests du processor avec repo et Whapi mockés (échouent d'abord)**

`services/whatsapp/test/processor.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

function webhookPayload(body: string, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-' + body,
      from_me: false,
      type: 'text',
      chat_id: '24177000001@s.whatsapp.net',
      from: '24177000001',
      from_name: 'Client Test',
      text: { body },
      ...overrides,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

describe('processor', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-1' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: { categories: [{ name: 'Plats', items: [{ id: 'i1', name: 'Bo Bun', price: 4500 }] }] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn().mockResolvedValue({ orderNumber: 42, total: 4500 }),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  it('message "menu" → répond la carte au chat_id, sauve l’état MENU', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu'))
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('Bo Bun'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MENU', expect.anything())
  })

  it('ignore from_me et les types non-text', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu', { from_me: true }))
    await process('chan-uuid', webhookPayload('menu', { type: 'image' }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inconnu → aucun envoi, pas de crash', async () => {
    repo.getChannel = vi.fn().mockResolvedValue(null)
    const process = createProcessor(repo, () => ({ sendText }))
    await process('unknown', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('message déjà traité (dédup) → skip', async () => {
    repo.logMessage = vi.fn().mockResolvedValue(false)
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('confirmation → crée la commande, vide le panier, envoie le numéro', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'drive', driveSlotId: 's1', driveSlotLabel: '12h00' },
    })
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('1'))
    expect(repo.createOrder).toHaveBeenCalledWith('resto-1', 'cust-1', expect.objectContaining({ mode: 'drive' }))
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('n°42'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ACCUEIL',
      expect.objectContaining({ items: [] }))
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- processor` — Expected: FAIL.

- [ ] **Step 3: Implémenter le repo**

`services/whatsapp/src/repo.ts` :
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, EMPTY_CART, type BotState, type Cart } from '@goutatou/db'
import type { BotContext } from './bot/machine.js'

export interface ChannelInfo {
  channelUuid: string
  restaurantId: string
  restaurantName: string
  token: string
  driveEnabled: boolean
}

export interface BotRepo {
  getChannel(channelUuid: string): Promise<ChannelInfo | null>
  getBotContext(restaurantId: string, restaurantName: string, driveEnabled: boolean): Promise<BotContext>
  upsertCustomer(restaurantId: string, phone: string, chatId: string, name?: string): Promise<{ id: string }>
  loadConversation(restaurantId: string, customerId: string): Promise<{ state: BotState; cart: Cart }>
  saveConversation(restaurantId: string, customerId: string, state: BotState, cart: Cart): Promise<void>
  createOrder(restaurantId: string, customerId: string, cart: Cart): Promise<{ orderNumber: number; total: number }>
  logMessage(
    restaurantId: string, direction: 'in' | 'out', chatId: string,
    body: string | null, whapiMessageId?: string, error?: string,
  ): Promise<boolean>
}

export function createRepo(db: SupabaseClient, tokenKey: string): BotRepo {
  return {
    async getChannel(channelUuid) {
      const { data } = await db
        .from('whapi_channels')
        .select('id, restaurant_id, token_encrypted, status, restaurants(name, drive_enabled)')
        .eq('id', channelUuid)
        .single()
      if (!data || data.status !== 'active') return null
      const resto = data.restaurants as unknown as { name: string; drive_enabled: boolean }
      await db.from('whapi_channels').update({ last_webhook_at: new Date().toISOString() }).eq('id', channelUuid)
      return {
        channelUuid,
        restaurantId: data.restaurant_id,
        restaurantName: resto.name,
        token: decryptToken(data.token_encrypted, tokenKey),
        driveEnabled: resto.drive_enabled,
      }
    },

    async getBotContext(restaurantId, restaurantName, driveEnabled) {
      const [{ data: cats }, { data: slots }] = await Promise.all([
        db.from('menu_categories')
          .select('name, position, menu_items(id, name, price, available, position)')
          .eq('restaurant_id', restaurantId)
          .order('position'),
        db.from('drive_slots').select('id, label, position')
          .eq('restaurant_id', restaurantId).eq('active', true).order('position'),
      ])
      return {
        restaurantName,
        driveEnabled,
        driveSlots: (slots ?? []).map((s) => ({ id: s.id, label: s.label })),
        menu: {
          categories: (cats ?? []).map((c) => ({
            name: c.name,
            items: ((c.menu_items as { id: string; name: string; price: number; available: boolean; position: number }[]) ?? [])
              .filter((i) => i.available)
              .sort((a, b) => a.position - b.position)
              .map((i) => ({ id: i.id, name: i.name, price: i.price })),
          })).filter((c) => c.items.length > 0),
        },
      }
    },

    async upsertCustomer(restaurantId, phone, chatId, name) {
      const { data, error } = await db
        .from('customers')
        .upsert(
          { restaurant_id: restaurantId, phone, chat_id: chatId, ...(name ? { name } : {}) },
          { onConflict: 'restaurant_id,phone' },
        )
        .select('id')
        .single()
      if (error || !data) throw new Error(`upsertCustomer: ${error?.message}`)
      return { id: data.id }
    },

    async loadConversation(restaurantId, customerId) {
      const { data } = await db
        .from('conversations')
        .select('state, cart')
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', customerId)
        .maybeSingle()
      if (!data) return { state: 'ACCUEIL', cart: EMPTY_CART }
      return { state: data.state as BotState, cart: data.cart as Cart }
    },

    async saveConversation(restaurantId, customerId, state, cart) {
      const { error } = await db.from('conversations').upsert(
        { restaurant_id: restaurantId, customer_id: customerId, state, cart, updated_at: new Date().toISOString() },
        { onConflict: 'restaurant_id,customer_id' },
      )
      if (error) throw new Error(`saveConversation: ${error.message}`)
    },

    async createOrder(restaurantId, customerId, cart) {
      const { data, error } = await db.rpc('create_order', {
        p_restaurant_id: restaurantId,
        p_customer_id: customerId,
        p_source: 'whatsapp',
        p_mode: cart.mode,
        p_items: cart.items.map((it) => ({ menu_item_id: it.menuItemId, qty: it.qty })),
        p_drive_slot_id: cart.driveSlotId ?? null,
        p_delivery_address: cart.address ?? null,
      })
      if (error || !data?.[0]) throw new Error(`create_order: ${error?.message}`)
      return { orderNumber: Number(data[0].order_number), total: data[0].total }
    },

    async logMessage(restaurantId, direction, chatId, body, whapiMessageId, error) {
      const { error: insertError } = await db.from('message_logs').insert({
        restaurant_id: restaurantId, direction, chat_id: chatId, body,
        whapi_message_id: whapiMessageId ?? null, error: error ?? null,
      })
      if (insertError?.code === '23505') return false // dédup : déjà traité
      if (insertError) throw new Error(`logMessage: ${insertError.message}`)
      return true
    },
  }
}
```

- [ ] **Step 4: Implémenter le processor**

`services/whatsapp/src/processor.ts` :
```ts
import { EMPTY_CART, formatFcfa } from '@goutatou/db'
import type { WhapiClient } from '@goutatou/whapi'
import { transition } from './bot/machine.js'
import type { BotRepo } from './repo.js'

interface WhapiMessage {
  id: string
  from_me: boolean
  type: string
  chat_id: string
  from: string
  from_name?: string
  text?: { body?: string }
}

function orderConfirmedCopy(orderNumber: number, total: number, cart: {
  mode?: string; driveSlotLabel?: string; address?: string
}): string {
  const detail =
    cart.mode === 'drive' ? `\n🚗 Retrait drive — créneau ${cart.driveSlotLabel}` :
    cart.mode === 'livraison' ? `\n🛵 Livraison — ${cart.address}` : ''
  return (
    `✅ Commande *n°${orderNumber}* confirmée !${detail}\n` +
    `Total à régler à la remise : *${formatFcfa(total)}*\n\n` +
    `Nous vous préviendrons ici à chaque étape. Merci ! 🙏`
  )
}

export function createProcessor(
  repo: BotRepo,
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText'>,
): (channelUuid: string, payload: unknown) => Promise<void> {
  return async (channelUuid, payload) => {
    const messages = (payload as { messages?: WhapiMessage[] })?.messages ?? []
    if (!messages.length) return

    const channel = await repo.getChannel(channelUuid)
    if (!channel) {
      console.warn(`[processor] canal inconnu ou inactif : ${channelUuid}`)
      return
    }
    const whapi = makeWhapi(channel.token)

    for (const msg of messages) {
      if (msg.from_me || msg.type !== 'text' || !msg.text?.body) continue

      // Idempotence : si ce message Whapi a déjà été loggé, on skip.
      const fresh = await repo.logMessage(channel.restaurantId, 'in', msg.chat_id, msg.text.body, msg.id)
      if (!fresh) continue

      try {
        const customer = await repo.upsertCustomer(channel.restaurantId, msg.from, msg.chat_id, msg.from_name)
        const conv = await repo.loadConversation(channel.restaurantId, customer.id)
        const ctx = await repo.getBotContext(channel.restaurantId, channel.restaurantName, channel.driveEnabled)

        const res = transition(conv.state, conv.cart, msg.text.body, ctx)
        const replies = [...res.replies]
        let nextCart = res.cart

        if (res.createOrder) {
          const order = await repo.createOrder(channel.restaurantId, customer.id, res.cart)
          replies.push(orderConfirmedCopy(order.orderNumber, order.total, res.cart))
          nextCart = EMPTY_CART
        }

        await repo.saveConversation(channel.restaurantId, customer.id, res.state, nextCart)

        for (const reply of replies) {
          try {
            const sent = await whapi.sendText(msg.chat_id, reply)
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, reply, sent.id)
          } catch (err) {
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, reply, undefined, String(err))
          }
        }
      } catch (err) {
        console.error(`[processor] erreur message ${msg.id}`, err)
        try {
          await whapi.sendText(msg.chat_id, 'Oups, un souci technique 😅 Tapez *menu* pour recommencer.')
        } catch { /* canal en erreur : déjà loggé */ }
      }
    }
  }
}
```

- [ ] **Step 5: Câbler dans `index.ts`**

`services/whatsapp/src/index.ts` (remplace le stub) :
```ts
import { createServiceClient } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createRepo } from './repo.js'
import { createProcessor } from './processor.js'

const config = loadConfig()
const db = createServiceClient(config.supabaseUrl, config.serviceRoleKey)
const repo = createRepo(db, config.tokenKey)
const processWebhook = createProcessor(repo, (token) => new WhapiClient(token))

const app = createApp({ processWebhook })
app.listen(config.port, () => console.log(`[service-whatsapp] écoute sur :${config.port}`))
```

- [ ] **Step 6: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test` — Expected: tous les tests PASS (app + machine + machine-order + processor).

- [ ] **Step 7: Commit**

```bash
git add services/whatsapp && git commit -m "feat(bot): repo Supabase + processor webhook (dédup, effets, envois, logs)"
```

---

### Task 11: Notifier — changement de statut commande → message WhatsApp

**Files:**
- Create: `services/whatsapp/src/notifier.ts`
- Modify: `services/whatsapp/src/index.ts`
- Test: `services/whatsapp/test/notifier.test.ts`

**Interfaces:**
- Consumes: `WhapiClient` (Task 6), `BotRepo` non requis — accès direct Supabase ; Realtime `postgres_changes` sur `orders` (publication configurée en Task 2).
- Produces:
  - `statusMessage(status: OrderStatus, orderNumber: number, mode: OrderMode): string | null` — `null` pour `recue` (déjà confirmée à la création) et `annulee` gérée à part.
  - `handleOrderUpdate(db: SupabaseClient, tokenKey: string, oldRow: OrderRow, newRow: OrderRow): Promise<void>` avec `interface OrderRow { id: string; restaurant_id: string; customer_id: string; order_number: number; status: OrderStatus; mode: OrderMode }`
  - `startNotifier(db: SupabaseClient, tokenKey: string): void` — souscrit au canal Realtime.

- [ ] **Step 1: Tests (échouent d'abord)**

`services/whatsapp/test/notifier.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest'
import { statusMessage, handleOrderUpdate, type OrderRow } from '../src/notifier.js'

describe('statusMessage', () => {
  it('couvre chaque statut notifiable selon le mode', () => {
    expect(statusMessage('en_preparation', 7, 'drive')).toContain('n°7')
    expect(statusMessage('en_preparation', 7, 'drive')).toContain('préparation')
    expect(statusMessage('prete', 7, 'drive')).toContain('prête')
    expect(statusMessage('prete', 7, 'livraison')).toContain('livreur')
    expect(statusMessage('recuperee', 7, 'drive')).toContain('Merci')
    expect(statusMessage('annulee', 7, 'drive')).toContain('annulée')
    expect(statusMessage('recue', 7, 'drive')).toBeNull()
  })
})

describe('handleOrderUpdate', () => {
  const oldRow: OrderRow = { id: 'o1', restaurant_id: 'r1', customer_id: 'c1', order_number: 7, status: 'recue', mode: 'drive' }

  function fakeDb(chatId = '24177@s.whatsapp.net') {
    const single = vi.fn()
      .mockResolvedValueOnce({ data: { chat_id: chatId } })                       // customers
      .mockResolvedValueOnce({ data: { token_encrypted: 'enc', status: 'active' } }) // whapi_channels
    return { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })) }
  }

  it('statut inchangé → aucun envoi', async () => {
    const sendText = vi.fn()
    await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow, { ...oldRow }, () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('recue → prete : envoie le message au chat_id du client', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'prete' }, () => ({ sendText }), decrypt)
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('n°7'))
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/service-whatsapp test -- notifier` — Expected: FAIL.

- [ ] **Step 3: Implémenter**

`services/whatsapp/src/notifier.ts` :
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, type OrderMode, type OrderStatus } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'

export interface OrderRow {
  id: string
  restaurant_id: string
  customer_id: string
  order_number: number
  status: OrderStatus
  mode: OrderMode
}

export function statusMessage(status: OrderStatus, orderNumber: number, mode: OrderMode): string | null {
  switch (status) {
    case 'recue':
      return null // déjà confirmée à la création par le processor
    case 'en_preparation':
      return `👨‍🍳 Votre commande *n°${orderNumber}* est en préparation !`
    case 'prete':
      if (mode === 'drive') return `🚗 Votre commande *n°${orderNumber}* est prête ! Présentez-vous au point drive.`
      if (mode === 'livraison') return `🛵 Votre commande *n°${orderNumber}* est prête, le livreur arrive !`
      return `🍽️ Votre commande *n°${orderNumber}* est prête !`
    case 'recuperee':
      return `Merci et bon appétit ! 🙏 À très vite.`
    case 'annulee':
      return `❌ Votre commande *n°${orderNumber}* a été annulée. Contactez-nous pour toute question.`
  }
}

type MakeWhapi = (token: string) => Pick<WhapiClient, 'sendText'>
type Decrypt = (payload: string, keyHex: string) => string

export async function handleOrderUpdate(
  db: SupabaseClient,
  tokenKey: string,
  oldRow: OrderRow,
  newRow: OrderRow,
  makeWhapi: MakeWhapi = (token) => new WhapiClient(token),
  decrypt: Decrypt = decryptToken,
): Promise<void> {
  if (oldRow.status === newRow.status) return
  const message = statusMessage(newRow.status, newRow.order_number, newRow.mode)
  if (!message) return

  const { data: customer } = await db.from('customers').select('chat_id').eq('id', newRow.customer_id).single()
  const { data: channel } = await db
    .from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', newRow.restaurant_id).single()
  if (!customer || !channel || channel.status !== 'active') return

  try {
    await makeWhapi(decrypt(channel.token_encrypted, tokenKey)).sendText(customer.chat_id, message)
  } catch (err) {
    console.error(`[notifier] envoi échoué commande ${newRow.id}`, err)
  }
}

export function startNotifier(db: SupabaseClient, tokenKey: string): void {
  db.channel('orders-status')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        handleOrderUpdate(db, tokenKey, payload.old as OrderRow, payload.new as OrderRow)
          .catch((err) => console.error('[notifier]', err))
      },
    )
    .subscribe((status) => console.log(`[notifier] realtime: ${status}`))
}
```

Dans `services/whatsapp/src/index.ts`, ajouter après la création de `repo` :
```ts
import { startNotifier } from './notifier.js'
// ...
startNotifier(db, config.tokenKey)
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/service-whatsapp test` — Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp && git commit -m "feat(bot): notifications WhatsApp sur changement de statut (Realtime orders)"
```

---

### Task 12: Scaffold Next.js + auth Supabase

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/middleware.ts`, `apps/web/src/lib/supabase/{server.ts, admin.ts}`, `apps/web/src/app/{layout.tsx, globals.css}`, `apps/web/src/app/login/{page.tsx, actions.ts}`

**Interfaces:**
- Produces: `createSupabaseServer(): Promise<SupabaseClient>` (client SSR lié aux cookies, RLS active) ; `createAdminClient(): SupabaseClient` (service_role, serveur uniquement) ; middleware qui redirige `/app/*` et `/admin/*` vers `/login` si non connecté. Consommés par les Tasks 13–15.

- [ ] **Step 1: Créer l'app**

`apps/web/package.json` :
```json
{
  "name": "@goutatou/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@goutatou/db": "workspace:*",
    "@goutatou/whapi": "workspace:*",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.47.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/web/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts` :
```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {}
export default nextConfig
```

`apps/web/postcss.config.mjs` :
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`apps/web/tailwind.config.ts` :
```ts
import type { Config } from 'tailwindcss'
export default { content: ['./src/**/*.{ts,tsx}'] } satisfies Config
```

`apps/web/src/app/globals.css` :
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Clients Supabase**

`apps/web/src/lib/supabase/server.ts` :
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* appelé depuis un Server Component : ignoré, le middleware rafraîchit */ }
        },
      },
    },
  )
}
```

`apps/web/src/lib/supabase/admin.ts` :
```ts
import 'server-only'
import { createServiceClient } from '@goutatou/db'

/** Client service_role — servers actions admin uniquement. Ne JAMAIS importer côté client. */
export function createAdminClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
```
(Ajouter la dépendance `server-only` : `pnpm --filter @goutatou/web add server-only`.)

`apps/web/middleware.ts` :
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const isProtected = request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/admin')
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

export const config = { matcher: ['/app/:path*', '/admin/:path*'] }
```

- [ ] **Step 3: Layout + login**

`apps/web/src/app/layout.tsx` :
```tsx
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Goutatou' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  )
}
```

`apps/web/src/app/login/actions.ts` :
```ts
'use server'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })
  if (error) redirect('/login?error=1')
  redirect('/app/commandes')
}
```

`apps/web/src/app/login/page.tsx` :
```tsx
import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Goutatou — Connexion</h1>
      {error && <p className="text-sm text-red-600">Identifiants invalides.</p>}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="email@resto.com" className="rounded border p-2" />
        <input name="password" type="password" required placeholder="Mot de passe" className="rounded border p-2" />
        <button className="rounded bg-neutral-900 p-2 text-white">Se connecter</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Vérification manuelle**

Run: `pnpm install && pnpm --filter @goutatou/web dev` puis ouvrir `http://localhost:3000/login`.
Expected: formulaire visible ; `http://localhost:3000/app/commandes` redirige vers `/login` (non connecté). Créer un user de test dans Supabase Studio local (`supabase status` → Studio URL) avec email/mot de passe, l'insérer dans `restaurant_members`, se connecter → redirection `/app/commandes` (404 pour l'instant : la page arrive en Task 13).

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml && git commit -m "feat(web): scaffold Next.js 15, auth Supabase SSR, middleware, login"
```

---

### Task 13: Dashboard — kanban commandes temps réel

**Files:**
- Create: `apps/web/src/lib/orders.ts`, `apps/web/vitest.config.ts`, `apps/web/src/app/app/{layout.tsx}`, `apps/web/src/app/app/commandes/{page.tsx, board.tsx, actions.ts}`
- Test: `apps/web/test/orders.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServer` (Task 12), `OrderStatus`, `formatFcfa` (`@goutatou/db`), Realtime `orders` (publication Task 2).
- Produces:
  - `interface OrderCard { id: string; order_number: number; status: OrderStatus; mode: string; total: number; created_at: string; customer_name: string | null; customer_phone: string; drive_slot_label: string | null; delivery_address: string | null; items: { name: string; qty: number }[] }`
  - `KANBAN_COLUMNS: { status: OrderStatus; title: string }[]` (recue, en_preparation, prete, recuperee)
  - `groupByStatus(orders: OrderCard[]): Record<OrderStatus, OrderCard[]>`
  - `nextStatus(s: OrderStatus): OrderStatus | null` — recue→en_preparation→prete→recuperee→null
  - Server action `updateOrderStatus(orderId: string, status: OrderStatus): Promise<void>` (RLS : seul un membre du tenant peut le faire).

- [ ] **Step 1: Test des helpers purs (échoue d'abord)**

`apps/web/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } })
```

`apps/web/test/orders.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { groupByStatus, nextStatus, KANBAN_COLUMNS, type OrderCard } from '../src/lib/orders'

const order = (id: string, status: OrderCard['status']): OrderCard => ({
  id, order_number: 1, status, mode: 'drive', total: 1000, created_at: '2026-07-07T12:00:00Z',
  customer_name: null, customer_phone: '24177', drive_slot_label: null, delivery_address: null, items: [],
})

describe('kanban helpers', () => {
  it('groupByStatus répartit les commandes par colonne', () => {
    const grouped = groupByStatus([order('a', 'recue'), order('b', 'prete'), order('c', 'recue')])
    expect(grouped.recue.map((o) => o.id)).toEqual(['a', 'c'])
    expect(grouped.prete).toHaveLength(1)
    expect(grouped.en_preparation).toHaveLength(0)
  })
  it('nextStatus suit le flux et s’arrête à recuperee', () => {
    expect(nextStatus('recue')).toBe('en_preparation')
    expect(nextStatus('en_preparation')).toBe('prete')
    expect(nextStatus('prete')).toBe('recuperee')
    expect(nextStatus('recuperee')).toBeNull()
    expect(nextStatus('annulee')).toBeNull()
  })
  it('KANBAN_COLUMNS expose 4 colonnes dans l’ordre du flux', () => {
    expect(KANBAN_COLUMNS.map((c) => c.status)).toEqual(['recue', 'en_preparation', 'prete', 'recuperee'])
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/web test` — Expected: FAIL.

- [ ] **Step 3: Implémenter les helpers**

`apps/web/src/lib/orders.ts` :
```ts
import type { OrderStatus } from '@goutatou/db'

export interface OrderCard {
  id: string
  order_number: number
  status: OrderStatus
  mode: string
  total: number
  created_at: string
  customer_name: string | null
  customer_phone: string
  drive_slot_label: string | null
  delivery_address: string | null
  items: { name: string; qty: number }[]
}

export const KANBAN_COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'recue', title: '📥 Reçues' },
  { status: 'en_preparation', title: '👨‍🍳 En préparation' },
  { status: 'prete', title: '✅ Prêtes' },
  { status: 'recuperee', title: '🏁 Récupérées' },
]

export function groupByStatus(orders: OrderCard[]): Record<OrderStatus, OrderCard[]> {
  const grouped: Record<OrderStatus, OrderCard[]> = {
    recue: [], en_preparation: [], prete: [], recuperee: [], annulee: [],
  }
  for (const o of orders) grouped[o.status].push(o)
  return grouped
}

const FLOW: Partial<Record<OrderStatus, OrderStatus>> = {
  recue: 'en_preparation',
  en_preparation: 'prete',
  prete: 'recuperee',
}

export function nextStatus(s: OrderStatus): OrderStatus | null {
  return FLOW[s] ?? null
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/web test` — Expected: 3 tests PASS.

- [ ] **Step 5: Pages et actions**

`apps/web/src/app/app/layout.tsx` :
```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-6 border-b bg-white px-6 py-3">
        <span className="font-bold">Goutatou</span>
        <Link href="/app/commandes" className="text-sm hover:underline">Commandes</Link>
        <Link href="/app/menu" className="text-sm hover:underline">Menu</Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

`apps/web/src/app/app/commandes/actions.ts` :
```ts
'use server'
import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@goutatou/db'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw new Error(`Mise à jour impossible : ${error.message}`)
  revalidatePath('/app/commandes')
}

export async function cancelOrder(orderId: string) {
  return updateOrderStatus(orderId, 'annulee')
}
```

`apps/web/src/app/app/commandes/page.tsx` :
```tsx
import { createSupabaseServer } from '@/lib/supabase/server'
import type { OrderCard } from '@/lib/orders'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CommandesPage() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('orders')
    .select(`id, order_number, status, mode, total, created_at, delivery_address,
             customers(name, phone), drive_slots(label), order_items(name, qty)`)
    .neq('status', 'annulee')
    .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })

  const orders: OrderCard[] = (data ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string | null; phone: string } | null
    const slot = o.drive_slots as unknown as { label: string } | null
    return {
      id: o.id, order_number: o.order_number, status: o.status, mode: o.mode,
      total: o.total, created_at: o.created_at, delivery_address: o.delivery_address,
      customer_name: customer?.name ?? null, customer_phone: customer?.phone ?? '',
      drive_slot_label: slot?.label ?? null,
      items: (o.order_items as { name: string; qty: number }[]) ?? [],
    }
  })

  return <Board initialOrders={orders} />
}
```

`apps/web/src/app/app/commandes/board.tsx` :
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { formatFcfa } from '@goutatou/db'
import { groupByStatus, KANBAN_COLUMNS, nextStatus, type OrderCard } from '@/lib/orders'
import { cancelOrder, updateOrderStatus } from './actions'

export function Board({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders] = useState(initialOrders)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel('orders-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => router.refresh())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [router])

  const grouped = groupByStatus(orders)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {KANBAN_COLUMNS.map((col) => (
        <section key={col.status} className="rounded-lg bg-neutral-100 p-3">
          <h2 className="mb-3 font-semibold">{col.title} ({grouped[col.status].length})</h2>
          <div className="flex flex-col gap-3">
            {grouped[col.status].map((o) => {
              const next = nextStatus(o.status)
              return (
                <article key={o.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex justify-between font-semibold">
                    <span>n°{o.order_number}</span>
                    <span>{formatFcfa(o.total)}</span>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {o.customer_name ?? o.customer_phone} · {o.mode === 'drive' ? `🚗 ${o.drive_slot_label}` :
                      o.mode === 'livraison' ? `🛵 ${o.delivery_address}` : '🍽️ Sur place'}
                  </p>
                  <ul className="mt-1 text-sm">
                    {o.items.map((it, i) => <li key={i}>{it.qty}× {it.name}</li>)}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    {next && (
                      <button
                        onClick={() => updateOrderStatus(o.id, next)}
                        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                      >
                        → {KANBAN_COLUMNS.find((c) => c.status === next)?.title}
                      </button>
                    )}
                    {o.status === 'recue' && (
                      <button onClick={() => cancelOrder(o.id)} className="rounded border px-2 py-1 text-xs">
                        Annuler
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Vérification manuelle**

Avec Supabase local + user membre d'un resto de test : insérer une commande en SQL (Studio), vérifier qu'elle apparaît dans la colonne « Reçues », cliquer « → En préparation », vérifier le déplacement. Insérer une 2e commande en SQL pendant que la page est ouverte → elle apparaît sans recharger (Realtime).

- [ ] **Step 7: Commit**

```bash
git add apps/web && git commit -m "feat(web): kanban commandes temps réel avec avancement de statut"
```

---

### Task 14: Dashboard — CRUD menu

**Files:**
- Create: `apps/web/src/app/app/menu/{page.tsx, actions.ts}`

**Interfaces:**
- Consumes: `createSupabaseServer` (Task 12), `formatFcfa` (`@goutatou/db`), Storage bucket `menu-photos` (créé ici).
- Produces: server actions `createCategory(formData)`, `createItem(formData)`, `toggleItemAvailable(itemId, available)`, `deleteItem(itemId)` — toutes sous RLS (le client SSR porte la session du membre).

- [ ] **Step 1: Créer le bucket Storage**

Run (SQL, via Studio local puis en prod via MCP Supabase) :
```sql
insert into storage.buckets (id, name, public) values ('menu-photos', 'menu-photos', true)
on conflict do nothing;
create policy menu_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos');
create policy menu_photos_read on storage.objects for select using (bucket_id = 'menu-photos');
```
Ajouter ce SQL comme migration `supabase/migrations/20260707000004_storage.sql`, puis `supabase db reset`.

- [ ] **Step 2: Actions**

`apps/web/src/app/app/menu/actions.ts` :
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'

async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return data.restaurant_id
}

export async function createCategory(formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  const { error } = await supabase.from('menu_categories').insert({
    restaurant_id: restaurantId,
    name: String(formData.get('name')),
    position: Number(formData.get('position') ?? 0),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function createItem(formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  let photoUrl: string | null = null
  const photo = formData.get('photo') as File | null
  if (photo && photo.size > 0) {
    const path = `${restaurantId}/${Date.now()}-${photo.name}`
    const { error: upErr } = await supabase.storage.from('menu-photos').upload(path, photo)
    if (upErr) throw new Error(upErr.message)
    photoUrl = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl
  }
  const { error } = await supabase.from('menu_items').insert({
    restaurant_id: restaurantId,
    category_id: String(formData.get('category_id')),
    name: String(formData.get('name')),
    description: String(formData.get('description') ?? '') || null,
    price: Number(formData.get('price')),
    photo_url: photoUrl,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function toggleItemAvailable(itemId: string, available: boolean) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('menu_items').update({ available }).eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function deleteItem(itemId: string) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('menu_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}
```

- [ ] **Step 3: Page**

`apps/web/src/app/app/menu/page.tsx` :
```tsx
import { formatFcfa } from '@goutatou/db'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createCategory, createItem, deleteItem, toggleItemAvailable } from './actions'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const supabase = await createSupabaseServer()
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id, name, position, menu_items(id, name, description, price, available, photo_url)')
    .order('position')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold">Menu</h1>

      {(categories ?? []).map((cat) => (
        <section key={cat.id} className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">{cat.name}</h2>
          <ul className="flex flex-col gap-2">
            {(cat.menu_items as { id: string; name: string; description: string | null; price: number; available: boolean }[]).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <span className={item.available ? '' : 'line-through opacity-50'}>{item.name}</span>
                  <span className="ml-2 text-sm text-neutral-600">{formatFcfa(item.price)}</span>
                </div>
                <div className="flex gap-2">
                  <form action={toggleItemAvailable.bind(null, item.id, !item.available)}>
                    <button className="rounded border px-2 py-1 text-xs">
                      {item.available ? 'Rupture' : 'Disponible'}
                    </button>
                  </form>
                  <form action={deleteItem.bind(null, item.id)}>
                    <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Suppr.</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <form action={createItem} className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <input type="hidden" name="category_id" value={cat.id} />
            <input name="name" required placeholder="Nom du plat" className="rounded border p-2" />
            <input name="price" required type="number" min="0" placeholder="Prix (FCFA)" className="rounded border p-2" />
            <input name="description" placeholder="Description (optionnel)" className="col-span-2 rounded border p-2" />
            <input name="photo" type="file" accept="image/*" className="text-xs" />
            <button className="rounded bg-neutral-900 p-2 text-white">Ajouter le plat</button>
          </form>
        </section>
      ))}

      <form action={createCategory} className="flex gap-2">
        <input name="name" required placeholder="Nouvelle catégorie" className="flex-1 rounded border p-2" />
        <button className="rounded bg-neutral-900 px-4 text-white">Créer</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Vérification manuelle**

Créer une catégorie « Plats », ajouter « Bo Bun » à 4500, basculer en rupture, vérifier en SQL que `available=false`. Uploader une photo → URL publique remplie.

- [ ] **Step 5: Commit**

```bash
git add apps/web supabase && git commit -m "feat(web): CRUD menu (catégories, plats, photos, disponibilité)"
```

---

### Task 15: Admin plateforme — onboarding restaurant

**Files:**
- Create: `apps/web/src/app/admin/{layout.tsx, page.tsx, actions.ts}`

**Interfaces:**
- Consumes: `createAdminClient` (Task 12), `encryptToken` (`@goutatou/db`), `WhapiClient.setWebhook` + `checkHealth` (`@goutatou/whapi`), env `PUBLIC_WEBHOOK_BASE_URL`, `TOKEN_ENCRYPTION_KEY`.
- Produces: server actions `createRestaurant(formData)` (resto + owner + abonnement + canal Whapi chiffré) et `configureWebhook(channelUuid)` (PATCH /settings Whapi vers `${PUBLIC_WEBHOOK_BASE_URL}/hook/${channelUuid}`). Layout admin qui bloque les non-`platform_admins`.

- [ ] **Step 1: Layout gardé**

`apps/web/src/app/admin/layout.tsx` :
```tsx
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!admin) redirect('/app/commandes')
  return (
    <div className="min-h-screen">
      <nav className="border-b bg-neutral-900 px-6 py-3 text-white">Goutatou — Admin plateforme</nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Actions**

`apps/web/src/app/admin/actions.ts` :
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { encryptToken } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

async function assertPlatformAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non connecté')
  const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!data) throw new Error('Réservé aux admins plateforme')
}

export async function createRestaurant(formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name'))
  const ownerEmail = String(formData.get('owner_email'))
  const ownerPassword = String(formData.get('owner_password'))
  const whapiToken = String(formData.get('whapi_token'))

  const { data: resto, error: restoErr } = await admin
    .from('restaurants').insert({ slug, name }).select('id').single()
  if (restoErr || !resto) throw new Error(`Création resto : ${restoErr?.message}`)

  const { data: owner, error: userErr } = await admin.auth.admin.createUser({
    email: ownerEmail, password: ownerPassword, email_confirm: true,
  })
  if (userErr || !owner.user) throw new Error(`Création owner : ${userErr?.message}`)

  const { error: memberErr } = await admin.from('restaurant_members')
    .insert({ user_id: owner.user.id, restaurant_id: resto.id, role: 'owner' })
  if (memberErr) throw new Error(memberErr.message)

  const { error: subErr } = await admin.from('subscriptions').insert({ restaurant_id: resto.id })
  if (subErr) throw new Error(subErr.message)

  const { error: chanErr } = await admin.from('whapi_channels').insert({
    restaurant_id: resto.id,
    token_encrypted: encryptToken(whapiToken, process.env.TOKEN_ENCRYPTION_KEY!),
  })
  if (chanErr) throw new Error(chanErr.message)

  revalidatePath('/admin')
}

export async function configureWebhook(channelUuid: string, whapiToken: string) {
  await assertPlatformAdmin()
  const webhookUrl = `${process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/${channelUuid}`
  const whapi = new WhapiClient(whapiToken)
  if (!(await whapi.checkHealth())) throw new Error('Canal Whapi injoignable (token invalide ?)')
  await whapi.setWebhook(webhookUrl)
  revalidatePath('/admin')
}
```

- [ ] **Step 3: Page**

`apps/web/src/app/admin/page.tsx` :
```tsx
import { decryptToken } from '@goutatou/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { configureWebhook, createRestaurant } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: restos } = await admin
    .from('restaurants')
    .select('id, slug, name, created_at, whapi_channels(id, token_encrypted, status, last_webhook_at)')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Nouveau restaurant</h2>
        <form action={createRestaurant} className="grid grid-cols-2 gap-2 text-sm">
          <input name="name" required placeholder="Nom du restaurant" className="rounded border p-2" />
          <input name="slug" required placeholder="slug (ex. chez-mama)" pattern="[a-z0-9-]{2,40}" className="rounded border p-2" />
          <input name="owner_email" required type="email" placeholder="Email du gérant" className="rounded border p-2" />
          <input name="owner_password" required placeholder="Mot de passe initial" className="rounded border p-2" />
          <input name="whapi_token" required placeholder="Token du canal Whapi" className="col-span-2 rounded border p-2" />
          <button className="col-span-2 rounded bg-neutral-900 p-2 text-white">Créer le restaurant</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Restaurants ({restos?.length ?? 0})</h2>
        {(restos ?? []).map((r) => {
          const chan = (r.whapi_channels as unknown as {
            id: string; token_encrypted: string; status: string; last_webhook_at: string | null
          } | null)
          return (
            <article key={r.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{r.name}</span>
                  <span className="ml-2 text-sm text-neutral-500">/{r.slug}</span>
                </div>
                {chan && (
                  <form action={configureWebhook.bind(null, chan.id,
                    decryptToken(chan.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))}>
                    <button className="rounded border px-3 py-1 text-sm">Configurer le webhook</button>
                  </form>
                )}
              </div>
              {chan && (
                <p className="mt-1 text-xs text-neutral-500">
                  Canal : {chan.status} · Dernier webhook : {chan.last_webhook_at ?? 'jamais'} ·
                  URL : {process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/{chan.id}
                </p>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Vérification manuelle**

En local : s'insérer dans `platform_admins` (SQL Studio), ouvrir `/admin`, créer un resto de test avec un faux token → le resto apparaît, le canal est chiffré en base (vérifier que `token_encrypted` contient `:`). Se connecter avec le compte gérant créé → il voit `/app/commandes` de SON resto uniquement.

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(web): admin plateforme — onboarding resto, canal Whapi chiffré, config webhook"
```

---

### Task 16: Déploiement (Supabase prod, Railway, Netlify) + smoke test

**Files:**
- Create: `netlify.toml`, `docs/deploiement.md`

**Interfaces:**
- Consumes: tout ; MCP Supabase (`apply_migration`), MCP Railway (`create_service`, `set_variables`, `deploy`), MCP Whapi (`checkHealth`, `updateChannelSettings`) disponibles dans la session Claude Code.

- [ ] **Step 1: Appliquer les migrations en prod**

Via MCP Supabase (projet `vaowvldazfcmietacctz`) : `apply_migration` pour chacune des 4 migrations dans l'ordre. Vérifier avec `list_tables` que les 13 tables existent, puis `get_advisors` (security) — corriger tout avis bloquant.

- [ ] **Step 2: Déployer le service bot sur Railway**

Via MCP Railway : créer le projet `goutatou`, service `whatsapp-bot` connecté au repo GitHub (root `/`, Dockerfile `services/whatsapp/Dockerfile`), variables :
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (généré : `openssl rand -hex 32`), `PORT=8080`. Générer le domaine public → noter `https://<domaine>` comme `PUBLIC_WEBHOOK_BASE_URL`.
Vérifier : `curl https://<domaine>/health` → `{"ok":true}`.

- [ ] **Step 3: Déployer apps/web sur Netlify**

`netlify.toml` :
```toml
[build]
  base = "."
  command = "pnpm install && pnpm --filter @goutatou/web build"
  publish = "apps/web/.next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```
Variables Netlify : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` (le même que Railway), `PUBLIC_WEBHOOK_BASE_URL`.
Vérifier : `/login` accessible en prod.

- [ ] **Step 4: Onboarder le premier resto réel et configurer le webhook**

1. S'insérer dans `platform_admins` en prod (SQL via MCP Supabase, avec l'UUID du compte admin créé via l'UI Supabase Auth).
2. `/admin` → créer le resto avec le vrai token du canal Whapi.
3. Cliquer « Configurer le webhook » (ou via MCP Whapi `updateChannelSettings` avec l'URL `https://<railway>/hook/<channelUuid>`).
4. `checkHealth` via MCP Whapi → statut OK.

- [ ] **Step 5: Smoke test E2E réel**

Depuis un vrai WhatsApp : envoyer « menu » au numéro du canal → recevoir la carte ; commander 1 plat → « valider » → drive → créneau → confirmer → vérifier la commande dans le kanban `/app/commandes` ; avancer le statut → recevoir la notification « en préparation » puis « prête » sur WhatsApp.
Expected: le cycle complet passe sans intervention manuelle en base.

- [ ] **Step 6: Documenter et commiter**

`docs/deploiement.md` : noter les URLs (Railway, Netlify, Supabase), la liste des variables d'env par plateforme, et la procédure d'onboarding d'un resto (créer canal Whapi → `/admin` → configurer webhook → seed menu + créneaux drive).

```bash
git add netlify.toml docs/deploiement.md && git commit -m "chore: config déploiement Netlify + doc de déploiement"
```

---

## Self-Review (fait à la rédaction)

- **Couverture spec phase 1** : schéma+RLS (T2–T4), bot multi-canal flow complet drive inclus (T6–T10), notifications statut (T11), dashboard temps réel commandes+menu (T12–T14), admin onboarding minimal (T15), déploiement (T16). Les statuts WhatsApp, campagnes, roue et LP sont hors phase 1 (phases 2–4), conformément à la spec.
- **Placeholders** : aucun TBD/TODO ; chaque étape code contient le code.
- **Cohérence de types** : `BotState`/`Cart`/`OrderMode`/`OrderStatus` définis une fois dans `@goutatou/db` (T5) et consommés partout ; signatures `BotRepo` (T10) alignées avec les mocks du test processor ; `create_order` SQL (T4) alignée avec `repo.createOrder` (T10) ; format webhook conforme aux références du skill whapi (`chat_id`, `from_me`, `text.body`, réponse à `chat_id`).
```
