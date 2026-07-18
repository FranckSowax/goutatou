# Équipe & rôles — spec

**But :** comptes multiples par restaurant avec 2 rôles (**Patron** = `owner`, **Employé** = `staff`) et gating serveur. Connexion employé par **numéro WhatsApp + mot de passe** (email technique caché), invitation envoyée par WhatsApp.

## Fondation existante
- `restaurant_members.role` existe déjà : `text default 'owner' check (role in ('owner','staff'))`. **Aucun changement d'enum.** Patron=`owner`, Employé=`staff`.
- RLS `members_select` = `user_id = auth.uid()` → aujourd'hui un membre ne voit que **sa** ligne. Mutations = `is_platform_admin()` uniquement.
- Invitation gérant existante (`admin/actions.ts::createRestaurant`) = `admin.auth.admin.generateLink({type:'invite', email})` (crée le user + renvoie le lien) + insert `restaurant_members{role:'owner'}`. Repli `resendInvitation` = `type:'recovery'`. Envoi WhatsApp = `sendInvitationWhatsapp` via `whapiClientForRestaurant`.
- Résolution du membre dupliquée ~25× (`myRestaurantId()` / `.limit(1).maybeSingle()`), jamais factorisée, ne lit jamais `role`.
- Gating plan : `lib/premium.ts` (`isPro`/`assertPlan`) — modèle à cloner pour le rôle.
- `normalizeGabonPhone(input)` dans `lib/lp/wa.ts` → `241XXXXXXXX` ou `null`.
- Client service_role : `lib/supabase/admin.ts::createAdminClient()`.

## Décisions
- **Rôles** : Patron (tout) / Employé (opérationnel).
  - Employé voit : Accueil, Commandes (+ sur-place, ticket), Menu, Conversations, Clients, Fidélité.
  - Patron seul : Statistiques, Analyses, Marketing, Réglages, **Équipe**.
- **Connexion employé** : email technique déterministe `wa-<digits241>@staff.goutatou.app` (jamais exposé). Invitation par nom + numéro → lien d'activation sur son WhatsApp → il définit son mot de passe (page existante) → login par **numéro + mot de passe**.
- **Défense en profondeur** : RLS (`is_owner`) + gating serveur dans pages/actions patron + filtrage nav. Écritures sur l'équipe via service_role (le patron n'a pas d'accès direct en écriture).

## Migration `20260718000036_team_roles.sql`
```sql
alter table public.restaurant_members
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists invited_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now();

create or replace function public.is_owner(p_restaurant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurant_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id and role = 'owner'
  ) or is_platform_admin();
$$;

drop policy if exists members_select on public.restaurant_members;
create policy members_select on public.restaurant_members
  for select using (user_id = auth.uid() or is_owner(restaurant_id) or is_platform_admin());

notify pgrst, 'reload schema';
```
`is_owner` est SECURITY DEFINER (propriétaire postgres → RLS bypassée dans la fonction, pas de récursion sur la policy). Écritures : restent `is_platform_admin()` en RLS ; le patron passe par `createAdminClient()` dans des actions gardées.

## Fichiers app
- **`lib/member.ts`** (server-only) : `type MemberRole='owner'|'staff'` ; `interface Member{restaurantId,role,userId}` ; `getMember(supabase):Promise<Member|null>` (auth.getUser → select `restaurant_id, role` eq user_id limit 1) ; `requireMember(supabase):Promise<Member>` (throw FR) ; `isOwner(m):boolean`.
- **`lib/roles.ts`** (server-only) : `requireOwnerPage(supabase):Promise<Member>` (redirect `/login` si non membre, redirect `/app` si non owner) ; `assertOwner(supabase):Promise<Member>` (throw `Action réservée au patron.`). Miroir de `premium.ts`.
- **`lib/staff-email.ts`** (pur, testé) : `staffEmailFromPhone(input):string|null` → `null` si `normalizeGabonPhone` renvoie null, sinon `wa-<digits>@staff.goutatou.app`.
- **`app/app/equipe/`** :
  - `page.tsx` (server, `force-dynamic`) : `requireOwnerPage` → `getTeam` → `<TeamView>`.
  - `team-data.ts` : `getTeam(supabase, restaurantId)` → membres (`user_id, role, display_name, phone, created_at`) triés owner d'abord puis date. Nom d'affichage : `display_name` sinon « Employé ».
  - `team-view.tsx` (client) : liste (nom, numéro mono, badge Patron/Employé, date), form « Inviter un employé » (nom + numéro), boutons Renvoyer le lien / Retirer (jamais soi-même ni le dernier owner) / Promouvoir↔Rétrograder. Messages FR via `useTransition`.
  - `actions.ts` (`'use server'`, chaque action `assertOwner` en tête) :
    - `inviteStaff(formData)` : nom + numéro → `staffEmailFromPhone` (throw si invalide) → `generateLink({type:'invite', email, redirectTo:/login/definir-mot-de-passe})` (si user existe déjà : `type:'recovery'`) → upsert `restaurant_members{user_id, restaurant_id, role:'staff', display_name, phone:digits, invited_by, }` (PK user_id+restaurant_id) → envoi du lien sur le WhatsApp de l'employé via le canal du resto (`${digits}@s.whatsapp.net`), best-effort (échec → note « lien copiable »). Retourne `{link}`.
    - `resendStaffLink(userId)` : recovery link → renvoi WhatsApp.
    - `removeStaff(userId)` : refuse si `userId===self` ou cible owner ; delete membership (admin).
    - `setStaffRole(userId, role)` : update role (admin) ; refuse de retirer le dernier owner.
- **`app/login/`** : `login-form.tsx` (client) segmenté « Patron (email) / Employé (numéro) ». `page.tsx` monte le composant. `actions.ts` : ajoute `loginByPhone(formData)` → `staffEmailFromPhone(phone)` → `signInWithPassword({email, password})` → redirect `/app` (erreur → `/login?error=1`).
- **Nav** : `layout.tsx` — chaque `NavItem` gagne `ownerOnly?:boolean` (Statistiques, Analyses, Marketing, Réglages, Équipe). Résoudre `getMember` dans le layout ; filtrer `NAV` si `role!=='owner'`. Ajouter item `{ href:'/app/equipe', label:'Équipe', icon:'UsersRound', match:'/app/equipe', ownerOnly:true }` (après Réglages ou en fin). `nav-links.tsx` : `UsersRound` dans ICONS + champ `ownerOnly` dans `NavItem`.
- **Gating pages patron** (guard `requireOwnerPage` en tête) : `reglages/page.tsx`, `stats/page.tsx`, `analyses/page.tsx`, `marketing/page.tsx` + sous-pages (`campagnes,chaine,qr,sondages,statuts`), `equipe/page.tsx`.
- **Gating actions patron** (guard `assertOwner`) : `reglages/actions.ts`, `marketing/*/actions.ts`. (Actions opérationnelles commandes/menu/clients/fidélité/livraison : accessibles employé — inchangées.)

## Tests
- `staff-email.test.ts` : `staffEmailFromPhone` (241…, 0X…, 8 chiffres, invalide→null, casse).
- `member.test.ts` : `isOwner` sur owner/staff/null. (getMember : intégration, non testée unitairement.)

## Vérif finale
typecheck + full test + `next build` (route `/app/equipe`), revue opus non-régression (surtout : aucune page opérationnelle cassée pour l'employé, pas de fuite d'accès patron, login patron intact). Migration appliquée en prod via MCP Supabase avant merge.
