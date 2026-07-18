import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberRole = 'owner' | 'staff'

export interface Member {
  restaurantId: string
  role: MemberRole
  userId: string
}

/**
 * Résout le membre (restaurant + rôle) de l'utilisateur courant en un seul endroit — source de
 * vérité du rôle côté app. RLS `members_select` ne renvoie que la ligne de l'utilisateur (ou toute
 * l'équipe si patron) ; on filtre explicitement sur `user_id` pour l'utilisateur courant.
 */
export async function getMember(supabase: SupabaseClient): Promise<Member | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('restaurant_members')
    .select('restaurant_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { restaurantId: data.restaurant_id as string, role: (data.role as MemberRole) ?? 'staff', userId: user.id }
}

export async function requireMember(supabase: SupabaseClient): Promise<Member> {
  const m = await getMember(supabase)
  if (!m) throw new Error('Aucun restaurant associé à ce compte')
  return m
}

export function isOwner(m: Pick<Member, 'role'> | null): boolean {
  return m?.role === 'owner'
}
