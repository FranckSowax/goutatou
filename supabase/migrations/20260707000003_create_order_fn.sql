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
