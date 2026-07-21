'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertOwner } from '@/lib/roles'
import { computeCashDay, type CashOrder } from '@/lib/cash'
import { dayBoundsUtc, formatYmdLibreville, isValidYmd } from '@/lib/order-day'

export interface CashActionResult {
  error: string | null
  /** Numéro du Z créé, quand la clôture a réussi. */
  closureNumber?: number
}

/** Traduit les erreurs nommées de la RPC `close_cash_day` en message FR affichable. */
function closeErrorMessage(raw: string): string {
  if (raw.includes('already_closed')) return 'Cette journée est déjà clôturée.'
  if (raw.includes('future_day')) return 'Impossible de clôturer une journée à venir.'
  if (raw.includes('Accès refusé')) return 'Accès refusé à ce restaurant.'
  return 'Clôture impossible pour le moment. Réessayez.'
}

/** Espèces comptées : entier positif, ou `null` si le champ est laissé vide. */
function parseCountedCash(raw: FormDataEntryValue | null): number | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  const n = Math.round(Number(s.replace(/\s/g, '').replace(',', '.')))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Fige le Z d'une journée. Les totaux ne viennent JAMAIS du client : on relit les commandes du jour
 * côté serveur et on rejoue `computeCashDay`, sinon n'importe qui pourrait clôturer une journée
 * avec les chiffres de son choix — un Z falsifiable ne vaut rien. Le client n'envoie que le jour,
 * le comptage physique du tiroir et la note.
 */
export async function closeCashDay(formData: FormData): Promise<CashActionResult> {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await assertOwner(supabase)

  const dayRaw = formData.get('day')
  const day = typeof dayRaw === 'string' && isValidYmd(dayRaw) ? dayRaw : null
  if (!day) return { error: 'Journée invalide.' }
  if (day > formatYmdLibreville(new Date())) {
    return { error: 'Impossible de clôturer une journée à venir.' }
  }

  const countedCash = parseCountedCash(formData.get('counted_cash'))
  const noteRaw = formData.get('note')
  const note = typeof noteRaw === 'string' ? noteRaw.trim().slice(0, 500) : ''

  const { startUtc, endUtc } = dayBoundsUtc(day)
  const { data: orders, error: readError } = await supabase
    .from('orders')
    .select('total, status, mode, source, payment_method, payment_status')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
  if (readError) return { error: 'Lecture des commandes du jour impossible.' }

  const cashDay = computeCashDay((orders ?? []) as CashOrder[])

  const { data, error } = await supabase.rpc('close_cash_day', {
    p_restaurant_id: restaurantId,
    p_day: day,
    p_cash_total: Math.round(cashDay.cashTotal),
    p_airtel_total: Math.round(cashDay.airtelTotal),
    p_pending_total: Math.round(cashDay.pendingTotal),
    p_canceled_total: Math.round(cashDay.canceledTotal),
    p_orders_count: cashDay.ordersCount,
    p_canceled_count: cashDay.canceledCount,
    p_by_mode: cashDay.byMode,
    p_by_source: cashDay.bySource,
    p_counted_cash: countedCash,
    p_note: note || null,
  })
  if (error) return { error: closeErrorMessage(error.message ?? '') }

  revalidatePath('/app/caisse')
  const row = Array.isArray(data) ? data[0] : data
  return { error: null, closureNumber: (row as { closure_number?: number } | null)?.closure_number }
}

/**
 * Rouvre la clôture du jour (erreur de comptage constatée dans la foulée). Volontairement limité à
 * la journée en cours : rouvrir un Z d'hier reviendrait à réécrire l'histoire de la caisse, ce que
 * l'archive est justement censée empêcher.
 */
export async function reopenClosure(day: string): Promise<CashActionResult> {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await assertOwner(supabase)

  if (!isValidYmd(day) || day !== formatYmdLibreville(new Date())) {
    return { error: 'Seule la clôture du jour peut être rouverte.' }
  }

  const { error } = await supabase
    .from('cash_closures')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('day', day)
  if (error) return { error: 'Réouverture impossible pour le moment. Réessayez.' }

  revalidatePath('/app/caisse')
  return { error: null }
}
