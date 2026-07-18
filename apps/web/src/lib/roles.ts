import 'server-only'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMember, requireMember, type Member } from './member'

/**
 * Garde de page patron : redirige un visiteur non connecté vers /login et un employé vers /app.
 * À appeler en tête d'un Server Component de page réservée au patron (Réglages, Analyses,
 * Marketing, Statistiques, Équipe).
 */
export async function requireOwnerPage(supabase: SupabaseClient): Promise<Member> {
  const m = await getMember(supabase)
  if (!m) redirect('/login')
  if (m.role !== 'owner') redirect('/app')
  return m
}

/** Garde de server action patron : jette une erreur FR si l'appelant n'est pas patron. */
export async function assertOwner(supabase: SupabaseClient): Promise<Member> {
  const m = await requireMember(supabase)
  if (m.role !== 'owner') throw new Error('Action réservée au patron.')
  return m
}
