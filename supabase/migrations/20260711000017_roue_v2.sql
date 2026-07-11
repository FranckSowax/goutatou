-- Roue v2 : segments "Pas de chance" / "Rejouez" paramétrables, images de lots,
-- expiration des gains + rappel. Voir docs/superpowers/specs/2026-07-11-roue-v2-design.md.

-- 1. DDL ---------------------------------------------------------------

alter table prizes add column image_url text;

alter table restaurants
  add column wheel_unlucky_weight int not null default 0 check (wheel_unlucky_weight >= 0),
  add column wheel_retry_weight int not null default 0 check (wheel_retry_weight >= 0);

alter table wheel_spins
  add column outcome text not null default 'prize' check (outcome in ('prize', 'lose', 'retry')),
  add column expires_at timestamptz,
  add column reminded_at timestamptz;

-- lose/retry n'ont ni lot ni code : prize_id et code deviennent nullable.
-- unique (restaurant_id, code) reste valide (NULL n'est jamais égal à NULL en SQL).
alter table wheel_spins alter column prize_id drop not null;
alter table wheel_spins alter column code drop not null;

-- 2. Bucket prize-media (même pattern durci que menu-photos : 0004 + 0006) ---

insert into storage.buckets (id, name, public) values ('prize-media', 'prize-media', true)
on conflict do nothing;

create policy prize_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prize-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

create policy prize_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'prize-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

-- Pas de policy de lecture : bucket public, objets servis via getPublicUrl sans
-- consulter RLS (cf. 0006 — une policy SELECT permettrait le listing de tous les
-- chemins de tous les tenants, c'est le gap qu'on a corrigé pour menu-photos).

-- 3. spin_wheel v2 -------------------------------------------------------
-- Re-déclaration intégrale depuis 0011 (unbiased single-threshold draw), étendue
-- aux deux segments virtuels "lose" et "retry". Rétrocompat garantie : quand
-- wheel_unlucky_weight = 0 et wheel_retry_weight = 0, le tirage est strictement
-- identique à v1 (même seuil, même comportement, mêmes lignes insérées, +
-- outcome='prize' et expires_at posés en plus).
--
-- Le type de retour gagne deux colonnes (outcome, expires_at) : Postgres
-- interdit de changer le type de retour d'une fonction via CREATE OR REPLACE,
-- il faut donc DROP explicitement avant de re-créer.

drop function if exists spin_wheel(uuid, uuid, text);

create function spin_wheel(p_restaurant_id uuid, p_customer_id uuid, p_jti text)
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
begin
  -- Verrou advisory transactionnel sur le jti : sérialise les appels concurrents
  -- partageant le même jti (relâché automatiquement à la fin de la transaction),
  -- pour que le check already_spun ci-dessous soit fiable sous concurrence.
  perform pg_advisory_xact_lock(hashtext(p_jti));

  if exists (select 1 from wheel_spins where jti = p_jti) then
    raise exception 'already_spun';
  end if;

  -- Somme des poids des lots disponibles
  select coalesce(sum(weight), 0) into v_prize_total
  from prizes where restaurant_id = p_restaurant_id and active and stock <> 0;

  select coalesce(wheel_unlucky_weight, 0), coalesce(wheel_retry_weight, 0)
  into v_unlucky_weight, v_retry_weight
  from restaurants where id = p_restaurant_id;

  v_total := v_prize_total + v_unlucky_weight + v_retry_weight;
  if v_total = 0 then
    raise exception 'no_prize';
  end if;

  -- Tirage pondéré : seuil aléatoire tiré une seule fois sur la somme des trois
  -- segments (lots + perdu + rejouez), puis premier segment dont le poids cumulé
  -- le franchit (random() est VOLATILE : le tirer par ligne biaiserait la
  -- distribution par rapport aux poids configurés).
  v_r := random() * v_total;

  if v_r < v_prize_total then
    -- Segment "lot" : comportement identique à v1.
    select p.* into v_prize from (
      select *, sum(weight) over (order by position, id) as cum
      from prizes where restaurant_id = p_restaurant_id and active and stock <> 0
    ) p
    where p.cum >= v_r
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
    v_outcome := 'prize';
    v_expires_at := now() + interval '30 days';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome, expires_at)
    values (p_restaurant_id, p_customer_id, v_prize.id, v_code, p_jti, v_outcome, v_expires_at);

    return query select v_prize.id, v_prize.label, v_code, v_outcome, v_expires_at;
  elsif v_r < v_prize_total + v_unlucky_weight then
    -- Segment "perdu" : aucune ligne prize, aucun code, jti quand même consommé.
    v_outcome := 'lose';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome)
    values (p_restaurant_id, p_customer_id, null, null, p_jti, v_outcome);

    return query select null::uuid, null::text, null::text, v_outcome, null::timestamptz;
  else
    -- Segment "rejouez" : idem, sans lot ni code ; le retryToken est géré côté
    -- appelant (route /api/roue/spin, hors périmètre de cette fonction).
    v_outcome := 'retry';

    insert into wheel_spins (restaurant_id, customer_id, prize_id, code, jti, outcome)
    values (p_restaurant_id, p_customer_id, null, null, p_jti, v_outcome);

    return query select null::uuid, null::text, null::text, v_outcome, null::timestamptz;
  end if;
end;
$$;

revoke execute on function spin_wheel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function spin_wheel(uuid, uuid, text) to service_role;
