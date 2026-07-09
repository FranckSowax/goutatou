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
    if not found then
      raise exception 'no_prize';   -- dernier exemplaire pris par un tour concurrent
    end if;
  end if;

  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti)
  values (p_restaurant_id, p_customer_id, v_prize.id, v_code, p_jti);

  return query select v_prize.id, v_prize.label, v_code;
end;
$$;

revoke execute on function spin_wheel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function spin_wheel(uuid, uuid, text) to service_role;
