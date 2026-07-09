'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan } from '@/lib/premium'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return { supabase, restaurantId: data.restaurant_id as string }
}

export async function createPrize(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('prizes').insert({
    restaurant_id: restaurantId,
    label: String(formData.get('label')),
    weight: Math.max(1, Number(formData.get('weight') ?? 1)),
    stock: Number(formData.get('stock') ?? -1),
    active: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function updatePrize(id: string, formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('prizes').update({
    weight: Math.max(1, Number(formData.get('weight') ?? 1)),
    stock: Number(formData.get('stock') ?? -1),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function togglePrizeActive(id: string, active: boolean) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('prizes').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function deletePrize(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('prizes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function updateWheelSettings(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const wheelEnabled = formData.get('wheel_enabled') === 'on'
  const triggerOrders = Math.max(1, Number(formData.get('wheel_trigger_orders') ?? 1))
  // restaurants n'a pas de policy RLS UPDATE pour les membres tenant (seulement
  // restaurants_select et restaurants_admin_all) : le client RLS-bound matcherait
  // 0 ligne silencieusement. On utilise le client admin (service_role) après le
  // gate ci-dessus (myRestaurantId + assertPlan prouvent déjà l'appartenance au
  // restaurant et le plan Pro), comme pour l'éditeur LP.
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ wheel_enabled: wheelEnabled, wheel_trigger_orders: triggerOrders })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/fidelite')
}

export async function redeemCode(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  if (!code) throw new Error('Code requis')
  const { data, error } = await supabase.from('wheel_spins')
    .update({ redeemed_at: new Date().toISOString(), redeemed_by: user.id })
    .eq('restaurant_id', restaurantId)
    .eq('code', code)
    .is('redeemed_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Code invalide ou déjà utilisé.')
  revalidatePath('/app/fidelite')
}
