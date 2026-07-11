-- create_order v2 : ajoute la prise en charge des suppléments (menu_supplements)
-- dans le panier p_items, avec pricing 100% serveur.
--
-- p_items reste un jsonb inchangé dans sa forme v1 : chaque entrée garde
-- {"menu_item_id": uuid, "qty": int} et gagne une clé OPTIONNELLE
-- "supplement_ids": [uuid, ...]. Un appel sans cette clé (v1) produit un
-- résultat identique à la fonction précédente (0003/0005) : mêmes lignes
-- order_items (aux valeurs près de la nouvelle colonne position), même total.
--
-- Adjacence contractuelle : order_items gagne une colonne position (ordre
-- d'affichage dans la commande). Chaque ligne supplément '↳ <nom>' porte une
-- position immédiatement consécutive à celle de sa ligne plat parente — c'est
-- LE mécanisme d'attribution d'un supplément à son parent, y compris quand le
-- même menu_item apparaît deux fois dans le panier avec des suppléments
-- différents. Les lignes historiques restent à position 0 (elles n'ont pas de
-- suppléments).
alter table order_items add column position integer not null default 0;

-- Pour chaque entrée du panier (dans l'ordre du tableau jsonb) : résolution
-- du plat côté serveur (même resto + disponible, sinon l'entrée est droppée
-- en entier — politique v1), insert de la ligne parente, puis insert des
-- lignes suppléments de CETTE entrée. Les ids de suppléments demandés sont
-- dédupliqués, filtrés sur le même plat (menu_item_id), le même restaurant
-- (restaurant_id) et disponibles (available) ; les ids inconnus, d'un autre
-- plat, d'un autre resto, ou indisponibles sont silencieusement ignorés
-- (même politique que les plats indisponibles en v1). Prix et disponibilité
-- viennent toujours de menu_supplements (jamais du client).
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
  v_item jsonb;
  v_mi menu_items%rowtype;
  v_qty int;
  v_sup record;
  v_position int := 0;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  insert into orders (restaurant_id, customer_id, source, mode, drive_slot_id, delivery_address)
  values (p_restaurant_id, p_customer_id, p_source, p_mode, p_drive_slot_id, p_delivery_address)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Résolution du plat : mêmes sémantiques que le join v1 (même resto +
    -- disponible). Entrée droppée en entier sinon (suppléments compris).
    select mi.* into v_mi
    from menu_items mi
    where mi.id = (v_item->>'menu_item_id')::uuid
      and mi.restaurant_id = p_restaurant_id and mi.available;

    if v_mi.id is null then
      continue;
    end if;

    v_qty := (v_item->>'qty')::int;

    -- Ligne plat parente.
    insert into order_items (order_id, restaurant_id, menu_item_id, name, unit_price, qty, position)
    values (v_order.id, p_restaurant_id, v_mi.id, v_mi.name, v_mi.price, v_qty, v_position);
    v_position := v_position + 1;

    -- Lignes suppléments de cette entrée, positions immédiatement
    -- consécutives à la ligne parente (adjacence).
    if v_item ? 'supplement_ids' then
      for v_sup in
        select s.name, s.price
        from menu_supplements s
        where s.id in (
                -- Ids malformés silencieusement ignorés (le cast ::uuid brut
                -- lèverait une exception et annulerait toute la commande).
                select distinct x::uuid
                from jsonb_array_elements_text(v_item->'supplement_ids') as x
                where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              )
          and s.menu_item_id = v_mi.id
          and s.restaurant_id = p_restaurant_id
          and s.available
        order by s.position, s.name
      loop
        insert into order_items (order_id, restaurant_id, menu_item_id, name, unit_price, qty, position)
        values (v_order.id, p_restaurant_id, v_mi.id, '↳ ' || v_sup.name, v_sup.price, v_qty, v_position);
        v_position := v_position + 1;
      end loop;
    end if;
  end loop;

  select coalesce(sum(unit_price * qty), 0) into v_total
  from order_items where order_items.order_id = v_order.id;

  if v_total = 0 then
    raise exception 'no_valid_items';
  end if;

  update orders set total = v_total where id = v_order.id;
  return query select v_order.id, v_order.order_number, v_total;
end;
$$;

-- ACL inchangée par rapport au durcissement 0005 : service_role only.
-- Re-déclarée par sûreté après le create or replace (une re-déclaration ne
-- devrait pas réinitialiser les grants existants, mais on la réaffirme
-- explicitement pour ne dépendre d'aucune supposition).
revoke execute on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text) to service_role;
