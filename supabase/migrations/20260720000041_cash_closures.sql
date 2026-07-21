-- Z de caisse : clôture de journée archivée et immuable. Les totaux sont FIGÉS à la clôture
-- (recopiés, jamais recalculés) — c'est ce qui donne au Z sa valeur de preuve : rouvrir la page
-- des mois plus tard doit afficher exactement les chiffres constatés le soir même, même si une
-- commande a été modifiée depuis.
--
-- Convention « encaissé » (miroir exact de `lib/cash.ts::computeCashDay`) :
--   * espèces  = commandes du jour REMISES au client (status = 'recuperee') dont le paiement
--                n'est pas Airtel (payment_method null ou 'cash') → argent réellement rentré ;
--   * airtel   = commandes du jour payées Airtel ET vérifiées (payment_status = 'paye') ;
--   * attente  = Airtel déclaré mais non vérifié ('a_verifier') + commandes non annulées pas
--                encore récupérées (argent pas encore rentré) ;
--   * annulé   = commandes du jour au statut 'annulee'.

create table if not exists public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  -- Numéro de Z, séquentiel PAR restaurant (repart à 1 pour chaque resto).
  closure_number int not null,
  -- Jour clôturé, au fuseau du restaurant (Africa/Libreville) — pas un timestamp.
  day date not null,

  -- Totaux figés (FCFA entiers) + compteurs.
  cash_total int not null default 0,
  airtel_total int not null default 0,
  pending_total int not null default 0,
  canceled_total int not null default 0,
  orders_count int not null default 0,
  canceled_count int not null default 0,
  -- Ventilations figées (mode / canal) : {"sur_place": 12000, ...}
  by_mode jsonb not null default '{}'::jsonb,
  by_source jsonb not null default '{}'::jsonb,

  -- Comptage physique du tiroir.
  counted_cash int,
  -- Écart = counted_cash - cash_total (négatif = manquant). Null si non compté.
  difference int,
  note text,

  closed_by uuid references auth.users(id),
  closed_at timestamptz not null default now(),

  -- Un seul Z par restaurant et par jour, et numérotation unique par resto.
  unique (restaurant_id, day),
  unique (restaurant_id, closure_number)
);
create index if not exists cash_closures_restaurant_day_idx
  on public.cash_closures (restaurant_id, day desc);

alter table public.cash_closures enable row level security;
-- Lecture/écriture réservées aux membres du resto ; la garde « patron » est appliquée côté
-- application (assertOwner) avant toute écriture, comme pour les autres réglages sensibles.
create policy tenant_all_cash_closures on public.cash_closures
  for all using (is_member(restaurant_id)) with check (is_member(restaurant_id));

/**
 * Crée le Z d'une journée de façon atomique : verrou par restaurant, calcul du prochain numéro
 * sous verrou, insertion. Deux clics simultanés ne peuvent pas produire deux Z ni deux fois le
 * même numéro (la contrainte unique est doublée d'un verrou pour éviter l'erreur brute).
 * Renvoie une erreur nommée `already_closed` si la journée est déjà clôturée.
 */
create or replace function public.close_cash_day(
  p_restaurant_id uuid,
  p_day date,
  p_cash_total int,
  p_airtel_total int,
  p_pending_total int,
  p_canceled_total int,
  p_orders_count int,
  p_canceled_count int,
  p_by_mode jsonb,
  p_by_source jsonb,
  p_counted_cash int default null,
  p_note text default null
) returns table (closure_id uuid, closure_number int)
language plpgsql security definer set search_path = public as $$
declare
  v_next int;
  v_id uuid;
  v_diff int;
begin
  if not is_member(p_restaurant_id) then
    raise exception 'Accès refusé à ce restaurant.' using errcode = '42501';
  end if;
  if p_day > (now() at time zone 'Africa/Libreville')::date then
    raise exception 'future_day';
  end if;

  perform pg_advisory_xact_lock(hashtext('cash:' || p_restaurant_id::text));

  -- Les colonnes sont TOUJOURS qualifiées par l'alias `cc` : `closure_number` est aussi une
  -- variable de sortie (RETURNS TABLE), et une référence nue serait ambiguë — PL/pgSQL lève
  -- alors « column reference is ambiguous » à l'exécution.
  if exists (select 1 from cash_closures cc where cc.restaurant_id = p_restaurant_id and cc.day = p_day) then
    raise exception 'already_closed';
  end if;

  select coalesce(max(cc.closure_number), 0) + 1 into v_next
  from cash_closures cc where cc.restaurant_id = p_restaurant_id;

  v_diff := case when p_counted_cash is null then null else p_counted_cash - p_cash_total end;

  insert into cash_closures (
    restaurant_id, closure_number, day,
    cash_total, airtel_total, pending_total, canceled_total, orders_count, canceled_count,
    by_mode, by_source, counted_cash, difference, note, closed_by
  ) values (
    p_restaurant_id, v_next, p_day,
    p_cash_total, p_airtel_total, p_pending_total, p_canceled_total, p_orders_count, p_canceled_count,
    coalesce(p_by_mode, '{}'::jsonb), coalesce(p_by_source, '{}'::jsonb),
    p_counted_cash, v_diff, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  )
  -- On ne renvoie que `id` : `closure_number` serait ambigu (variable de sortie homonyme) et sa
  -- valeur est déjà connue (v_next).
  returning cash_closures.id into v_id;

  return query select v_id, v_next;
end;
$$;

revoke all on function public.close_cash_day(uuid, date, int, int, int, int, int, int, jsonb, jsonb, int, text) from public;
grant execute on function public.close_cash_day(uuid, date, int, int, int, int, int, int, jsonb, jsonb, int, text) to authenticated;

notify pgrst, 'reload schema';
