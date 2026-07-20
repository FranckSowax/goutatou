'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPremium } from '@/lib/premium'
import { assertOwner } from '@/lib/roles'

/** Garde PATRON — `assertOwner` renvoie déjà le membre, plus de seconde requête `restaurant_members`. */
async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await assertOwner(supabase)
  return { supabase, restaurantId }
}

export async function createCampaign(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const action = String(formData.get('action')) // 'draft' | 'schedule' | 'now'
  const scheduledAtRaw = String(formData.get('scheduled_at') ?? '')
  if (action === 'schedule' && !scheduledAtRaw.trim()) {
    throw new Error('Choisissez une date et une heure d’envoi pour programmer la campagne.')
  }
  const status = action === 'now' ? 'sending' : action === 'schedule' ? 'scheduled' : 'draft'
  const { data, error } = await supabase.from('campaigns').insert({
    restaurant_id: restaurantId,
    name: String(formData.get('name')),
    body: String(formData.get('body')),
    media_url: String(formData.get('media_url') ?? '') || null,
    status,
    scheduled_at: action === 'schedule' && scheduledAtRaw ? new Date(scheduledAtRaw).toISOString()
      : action === 'now' ? new Date().toISOString() : null,
    started_at: action === 'now' ? new Date().toISOString() : null,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Création impossible')
  revalidatePath('/app/marketing/campagnes')
  redirect(`/app/marketing/campagnes/${data.id}`)
}

export async function cancelCampaign(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const { error } = await supabase.from('campaigns').update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', id).in('status', ['scheduled', 'sending'])
  if (error) throw new Error(error.message)
  revalidatePath(`/app/marketing/campagnes/${id}`)
  revalidatePath('/app/marketing/campagnes')
}

export async function uploadCampaignMedia(formData: FormData): Promise<string> {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)
  const file = formData.get('media') as File | null
  if (!file || file.size === 0) throw new Error('Aucun fichier')
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('campaign-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('campaign-media').getPublicUrl(path).data.publicUrl
}
