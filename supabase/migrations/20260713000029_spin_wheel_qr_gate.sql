-- Roue QR (Fidélité v3) — garde ATOMIQUE « 1 tour / client / période » dans spin_wheel.
--
-- POURQUOI : la vérification d'éligibilité côté routes (/api/roue/unlock puis /api/roue/spin)
-- est sujette à une course TOCTOU signalée en revue : un client appelle `unlock` deux fois
-- AVANT de tourner → `wheel_spins` est encore vide pour lui → les deux appels passent
-- l'éligibilité et deux jetons valides (jti distincts) sont émis ; les deux `spin` lancés en
-- parallèle lisent tous deux « aucun tour récent » avant qu'aucun INSERT n'ait committé →
-- deux tours (et potentiellement deux lots) pour un seul numéro. Le verrou existant ne
-- sérialise que les appels partageant le MÊME jti, pas le même client.
--
-- CORRECTIF : re-vérifier ici, sous verrou advisory transactionnel par CLIENT, pour que la
-- lecture du dernier tour et l'INSERT soient dans la même section critique. Le verrou client
-- est pris APRÈS celui du jti — ordre d'acquisition constant pour tous les appelants, donc
-- pas de deadlock.
--
-- PORTÉE : uniquement les jetons du flux QR public (`qr:%`) hors rejeu (suffixe exact `:r1`,
-- cf. mintRetryToken qui suffixe TOUJOURS `:r1` — anti-chaîne, un seul rejeu par jeton d'origine).
--   - flux v2 (jeton émis après N commandes, jti sans préfixe) → condition fausse, inchangé ;
--   - second tour « Rejouez ! » (`qr:<uuid>:r1`) → exclu, sinon le tour que la roue vient
--     d'accorder serait refusé par le tour qui vient d'être enregistré.
-- Le rejeu reste borné par mintRetryToken (anti-chaîne, un seul `:r1`) et par le jti single-use.
--
-- Signature et type de retour INCHANGÉS → `create or replace` suffit (pas de drop, donc pas de
-- re-grant d'ACL : les privilèges existants — revoke public/anon/authenticated, grant
-- service_role — sont conservés).

create or replace function spin_wheel(p_restaurant_id uuid, p_customer_id uuid, p_jti text)
returns table (prize_id uuid, label text, code text, outcome text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_prize prizes%rowtype;
  v_prize_total bigint;
  v_unlucky_weight bigint;
  v_retry_weight bigint;
  v_total bigint;
  v_code text;
  v_r numeric;
  v_outcome text;
  v_expires_at timestamptz;
  v_period int;
begin
  perform pg_advisory_xact_lock(hashtext(p_jti));

  if exists (select 1 from wheel_spins where jti = p_jti) then
    raise exception 'already_spun';
  end if;

  -- Garde « 1 tour / client / période » du flux QR public (cf. en-tête). Suffixe exact `:r1`
  -- (posé par mintRetryToken), pas `%:r%` : ce dernier ne fonctionnait que par coïncidence des
  -- uuid hexadécimaux (jamais de lettre `r`), un invariant implicite et fragile.
  if p_jti like 'qr:%' and p_jti not like '%:r1' then
    perform pg_advisory_xact_lock(hashtext(p_customer_id::text));

    select coalesce(wheel_spin_period_days, 30) into v_period
    from restaurants where id = p_restaurant_id;

    if coalesce(v_period, 30) > 0 and exists (
      select 1 from wheel_spins
      where customer_id = p_customer_id
        and created_at >= now() - make_interval(days => coalesce(v_period, 30))
    ) then
      raise exception 'already_spun_period';
    end if;
  end if;

  select coalesce(sum(weight), 0) into v_prize_total
  from prizes where restaurant_id = p_restaurant_id and active and stock <> 0;

  select coalesce(wheel_unlucky_weight, 0), coalesce(wheel_retry_weight, 0)
  into v_unlucky_weight, v_retry_weight
  from restaurants where id = p_restaurant_id;

  v_total := v_prize_total + v_unlucky_weight + v_retry_weight;
  if v_total = 0 then
    raise exception 'no_prize';
  end if;

  v_r := random() * v_total;

  if v_r < v_prize_total then
    select p.* into v_prize from (
      select *, sum(weight) over (order by position, id) as cum
      from prizes where restaurant_id = p_restaurant_id and active and stock <> 0
    ) p
    where p.cum >= v_r
    order by p.cum
    limit 1;

    if v_prize.stock > 0 then
      update prizes set stock = stock - 1 where id = v_prize.id and stock > 0;
      if not found then
        raise exception 'no_prize';
      end if;
    end if;

    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    v_outcome := 'prize';
    v_expires_at := now() + interval '30 days';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome, expires_at)
    values (p_restaurant_id, p_customer_id, v_prize.id, v_code, p_jti, v_outcome, v_expires_at);

    return query select v_prize.id, v_prize.label, v_code, v_outcome, v_expires_at;
  elsif v_r < v_prize_total + v_unlucky_weight then
    v_outcome := 'lose';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome)
    values (p_restaurant_id, p_customer_id, null, null, p_jti, v_outcome);

    return query select null::uuid, null::text, null::text, v_outcome, null::timestamptz;
  else
    v_outcome := 'retry';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome)
    values (p_restaurant_id, p_customer_id, null, null, p_jti, v_outcome);

    return query select null::uuid, null::text, null::text, v_outcome, null::timestamptz;
  end if;
end;
$$;

notify pgrst, 'reload schema';
