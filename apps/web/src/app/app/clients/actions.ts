'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'

/**
 * Note libre attachée à un client. Garde membre (`restaurant_members`) puis écriture via le client
 * Supabase authentifié : `customers` a une policy RLS tenant `for all` (migration 0002), donc pas
 * besoin du client admin — la RLS restreint déjà la ligne au restaurant du membre. Note vide → null.
 */
export async function updateCustomerNote(customerId: string, notes: string): Promise<void> {
  const supabase = await createSupabaseServer()
  const { data: member, error: memberErr } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .single()
  if (memberErr || !member) throw new Error('Aucun restaurant associé à ce compte')

  const { error } = await supabase
    .from('customers')
    .update({ notes: notes.trim() || null })
    .eq('id', customerId)
  if (error) throw new Error('Enregistrement de la note impossible.')

  revalidatePath('/app/clients')
}
