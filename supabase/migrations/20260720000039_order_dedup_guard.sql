-- Garde SQL anti double-commande (audit lot A, constat C1) : deux webhooks concurrents du même
-- client (double-tap « Oui ») peuvent produire deux create_order. Le mutex applicatif du bot
-- couvre le cas mono-réplica ; cette garde couvre le reste (overlap de deux instances pendant un
-- redéploiement Railway). Périmètre : source 'whatsapp' UNIQUEMENT — le comptoir (POS) enchaîne
-- légitimement des ventes rapides, souvent sur le même client par défaut.
-- Même corps que la v3 (0038) + verrou consultatif par client + rejet 'duplicate_order' si une
-- commande whatsapp du même client existe depuis < 20 s. Signature inchangée.

create or replace function public.create_order(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_source order_source,
  p_mode order_mode,
  p_items jsonb,
  p_drive_slot_id uuid default null,
  p_delivery_address text default null,
  p_payment_method text default null,
  p_payment_ref text default null
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
  v_payment_status text;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if p_payment_method is not null and p_payment_method not in ('cash', 'airtel') then
    raise exception 'invalid_payment_method';
  end if;

  -- Anti double-commande WhatsApp : sérialise par client (verrou transactionnel) puis rejette si
  -- une commande whatsapp du même client vient d'être créée (< 20 s). Le verrou garantit que deux
  -- transactions concurrentes ne passent pas toutes les deux le test d'existence.
  if p_source = 'whatsapp' then
    perform pg_advisory_xact_lock(hashtext('order:' || p_customer_id::text));
    if exists (
      select 1 from orders
      where restaurant_id = p_restaurant_id
        and customer_id = p_customer_id
        and source = 'whatsapp'
        and created_at > now() - interval '20 seconds'
    ) then
      raise exception 'duplicate_order';
    end if;
  end if;

  v_payment_status := case when p_payment_method = 'airtel' then 'a_verifier' else 'na' end;

  insert into orders (restaurant_id, customer_id, source, mode, drive_slot_id, delivery_address,
                      payment_method, payment_status, payment_ref)
  values (p_restaurant_id, p_customer_id, p_source, p_mode, p_drive_slot_id, p_delivery_address,
          p_payment_method, v_payment_status, nullif(trim(coalesce(p_payment_ref, '')), ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select mi.* into v_mi
    from menu_items mi
    where mi.id = (v_item->>'menu_item_id')::uuid
      and mi.restaurant_id = p_restaurant_id and mi.available;

    if v_mi.id is null then
      continue;
    end if;

    v_qty := (v_item->>'qty')::int;

    insert into order_items (order_id, restaurant_id, menu_item_id, name, unit_price, qty, position)
    values (v_order.id, p_restaurant_id, v_mi.id, v_mi.name, v_mi.price, v_qty, v_position);
    v_position := v_position + 1;

    if v_item ? 'supplement_ids' then
      for v_sup in
        select s.name, s.price
        from menu_supplements s
        where s.id in (
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

-- Signature inchangée → grants conservés ; réaffirmés par sûreté (pattern 0015/0038).
revoke all on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text, text, text) from public;
revoke all on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text, text, text) from anon, authenticated;
grant execute on function public.create_order(uuid, uuid, order_source, order_mode, jsonb, uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
