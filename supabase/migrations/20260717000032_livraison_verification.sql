-- Système de livraison (livreurs + attribution) + vérification commande.
-- Web uniquement ; RLS via helper projet is_member(restaurant_id) (cf. 0014).

-- 1) Livreurs : liste gérée par resto (hors table customers — jamais marketé).
create table if not exists public.livreurs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists livreurs_restaurant_active_idx
  on public.livreurs(restaurant_id) where active;

-- 2) Livraisons : une ligne par commande mode='livraison'.
do $$ begin
  create type delivery_dispatch_state as enum ('pending', 'assigned', 'delivered');
exception when duplicate_object then null; end $$;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  livreur_id uuid references public.livreurs(id) on delete set null,
  dispatch_state delivery_dispatch_state not null default 'pending',
  assigned_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deliveries_restaurant_state_idx
  on public.deliveries(restaurant_id, dispatch_state);

-- 3) Trigger : toute commande livraison entre automatiquement dans deliveries.
create or replace function public.create_delivery_for_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mode = 'livraison' then
    insert into public.deliveries (restaurant_id, order_id)
    values (new.restaurant_id, new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_create_delivery on public.orders;
create trigger trg_create_delivery
  after insert on public.orders
  for each row execute function public.create_delivery_for_order();

-- 4) Backfill des commandes livraison déjà présentes.
insert into public.deliveries (restaurant_id, order_id)
select o.restaurant_id, o.id from public.orders o
where o.mode = 'livraison'
on conflict (order_id) do nothing;

-- 5) Vérification commande (jugement humain, indépendant du statut Kanban).
alter table public.orders add column if not exists verified_at timestamptz;

-- 6) RLS.
alter table public.livreurs enable row level security;
alter table public.deliveries enable row level security;
drop policy if exists tenant_all_livreurs on public.livreurs;
create policy tenant_all_livreurs on public.livreurs for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));
drop policy if exists tenant_all_deliveries on public.deliveries;
create policy tenant_all_deliveries on public.deliveries for all
  using (is_member(restaurant_id)) with check (is_member(restaurant_id));

-- 7) Realtime : propager les changements de deliveries au board /livraison.
do $$ begin
  alter publication supabase_realtime add table public.deliveries;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
