'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPlan } from '@/lib/premium'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return { supabase, restaurantId: data.restaurant_id as string }
}

export async function createStatus(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const kind = String(formData.get('kind') ?? 'text') // 'text' | 'image'
  const content = String(formData.get('content') ?? '').trim()
  if (!content) throw new Error('Le contenu est requis.')
  const action = String(formData.get('action')) // 'now' | 'schedule' | 'draft'
  const scheduledAtRaw = String(formData.get('scheduled_at') ?? '')
  if (action === 'schedule' && !scheduledAtRaw.trim()) {
    throw new Error('Choisissez une date et une heure.')
  }
  const state = action === 'now' ? 'posting' : action === 'schedule' ? 'scheduled' : 'draft'
  const { error } = await supabase.from('statuses').insert({
    restaurant_id: restaurantId,
    kind,
    content,
    media_url: String(formData.get('media_url') ?? '') || null,
    state,
    scheduled_at: action === 'schedule' && scheduledAtRaw ? new Date(scheduledAtRaw).toISOString()
      : action === 'now' ? new Date().toISOString() : null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/statuts')
}

export async function cancelStatus(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('statuses').update({ state: 'canceled' })
    .eq('id', id).in('state', ['scheduled', 'posting'])
  if (error) throw new Error(error.message)
  revalidatePath('/app/statuts')
}

export async function uploadStatusMedia(formData: FormData): Promise<string> {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const file = formData.get('media') as File | null
  if (!file || file.size === 0) throw new Error('Aucun fichier')
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('status-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
}
