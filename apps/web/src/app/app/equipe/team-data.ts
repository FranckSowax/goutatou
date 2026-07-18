import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MemberRole } from '@/lib/member'

export interface TeamMember {
  userId: string
  role: MemberRole
  displayName: string | null
  phone: string | null
  createdAt: string | null
}

/**
 * Liste des membres d'un restaurant (patron uniquement — la policy `members_select` élargie via
 * `is_owner` autorise le patron à voir toute son équipe). Tri : le patron (owner) d'abord, puis
 * les employés par ancienneté (`created_at` croissant).
 */
export async function getTeam(supabase: SupabaseClient, restaurantId: string): Promise<TeamMember[]> {
  const { data } = await supabase
    .from('restaurant_members')
    .select('user_id, role, display_name, phone, created_at')
    .eq('restaurant_id', restaurantId)

  const members: TeamMember[] = (data ?? []).map((m) => ({
    userId: m.user_id as string,
    role: (m.role as MemberRole) ?? 'staff',
    displayName: (m.display_name as string | null) ?? null,
    phone: (m.phone as string | null) ?? null,
    createdAt: (m.created_at as string | null) ?? null,
  }))

  return members.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return at - bt
  })
}
