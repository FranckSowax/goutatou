-- Perf CRM : agrégation des clients côté SQL. La page /app/clients chargeait TOUTES les commandes
-- du resto depuis l'origine (+ order_items joints) pour agréger en JS (`lib/clients.ts::buildClients`).
-- `clients_summary` renvoie directement une ligne par client avec les agrégats.
--
-- Règles métier reprises à l'identique de `buildClients` :
--   * seules les commandes dont le statut <> 'annulee' comptent ;
--   * `avg_basket` = round(ltv / orders_count), 0 si aucune commande ;
--   * `favorite_item` = article le plus commandé en quantité, EN EXCLUANT les lignes supplément
--     (nom préfixé par « ↳ ») ; null si aucun article éligible ;
--   * les clients sans commande apparaissent quand même (LEFT JOIN) avec 0 / 0 / null.
--
-- Seule différence documentée avec `buildClients` : le DÉPARTAGE en cas d'égalité de quantité.
-- Côté JS il dépend de l'ordre d'insertion dans la Map (donc de l'ordre — non garanti — des lignes
-- renvoyées par PostgREST) ; ici il est déterministe : nom par ordre alphabétique croissant.
--
-- Garde tenant : la fonction est appelée par le client authentifié (pas service_role), donc
-- `security definer` + vérification explicite `is_member(p_restaurant_id)`.

create or replace function public.clients_summary(p_restaurant_id uuid)
returns table (
  customer_id uuid,
  orders_count bigint,
  ltv bigint,
  last_order_at timestamptz,
  avg_basket bigint,
  favorite_item text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_member(p_restaurant_id) then
    raise exception 'Accès refusé à ce restaurant.' using errcode = '42501';
  end if;

  return query
  with valid_orders as (
    select o.id as order_id, o.customer_id as cid, o.total as amount, o.created_at as ordered_at
    from orders o
    where o.restaurant_id = p_restaurant_id
      and o.status <> 'annulee'
  ),
  agg as (
    select vo.cid as cid,
           count(*)::bigint as cnt,
           coalesce(sum(vo.amount), 0)::bigint as total_sum,
           max(vo.ordered_at) as last_at
    from valid_orders vo
    group by vo.cid
  ),
  fav as (
    select t.cid as cid, t.item_name as fav_name
    from (
      select vo.cid as cid,
             oi.name as item_name,
             row_number() over (
               partition by vo.cid
               order by sum(oi.qty) desc, oi.name asc
             ) as rn
      from valid_orders vo
      join order_items oi on oi.order_id = vo.order_id
      where left(oi.name, 1) <> '↳'
      group by vo.cid, oi.name
    ) t
    where t.rn = 1
  )
  select c.id,
         coalesce(a.cnt, 0)::bigint,
         coalesce(a.total_sum, 0)::bigint,
         a.last_at,
         case
           when coalesce(a.cnt, 0) > 0 then round(a.total_sum::numeric / a.cnt)::bigint
           else 0::bigint
         end,
         f.fav_name
  from customers c
  left join agg a on a.cid = c.id
  left join fav f on f.cid = c.id
  where c.restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function public.clients_summary(uuid) from public;
grant execute on function public.clients_summary(uuid) to authenticated;

-- Index de support : l'agrégat joint order_items par commande et regroupe les commandes par client.
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists orders_restaurant_customer_idx on public.orders (restaurant_id, customer_id);
