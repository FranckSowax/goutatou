-- Équipe & rôles : métadonnées de membre + helper de rôle + visibilité équipe pour le patron.
-- `role` existe déjà (restaurant_members.role check owner|staff) — Patron=owner, Employé=staff.

alter table public.restaurant_members
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists invited_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now();

-- L'utilisateur courant est-il patron (owner) de ce resto ? SECURITY DEFINER (propriétaire
-- postgres → RLS bypassée dans la fonction, pas de récursion sur la policy members_select).
create or replace function public.is_owner(p_restaurant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurant_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id and role = 'owner'
  ) or is_platform_admin();
$$;

-- Le patron voit toute son équipe (avant : chacun ne voyait que sa propre ligne). Les mutations
-- restent réservées à is_platform_admin() en RLS ; le patron écrit via le client service_role
-- dans des server actions gardées assertOwner.
drop policy if exists members_select on public.restaurant_members;
create policy members_select on public.restaurant_members
  for select using (
    user_id = auth.uid()
    or is_owner(restaurant_id)
    or is_platform_admin()
  );

notify pgrst, 'reload schema';
