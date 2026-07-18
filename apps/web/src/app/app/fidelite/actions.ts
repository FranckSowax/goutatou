'use server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan } from '@/lib/premium'
import { normalizeGabonPhone } from '@/lib/lp/wa'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return { supabase, restaurantId: data.restaurant_id as string }
}

// Un champ stock vide/absent signifie "illimité" (-1), pas 0 (lot immédiatement épuisé).
function parseStock(formData: FormData): number {
  const raw = formData.get('stock')
  return raw === '' || raw == null ? -1 : Number(raw)
}

export async function createPrize(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('prizes').insert({
    restaurant_id: restaurantId,
    label: String(formData.get('label')),
    weight: Math.max(1, Number(formData.get('weight') ?? 1)),
    stock: parseStock(formData),
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
    stock: parseStock(formData),
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

// Segments spéciaux "Pas de chance" / "Rejouez !" (roue v2) : 0 = désactivé. Même
// contrainte RLS que updateWheelSettings ci-dessus (pas de policy UPDATE tenant sur
// restaurants) → client admin après le même gate myRestaurantId + assertPlan.
export async function updateWheelWeights(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const unluckyWeight = Math.max(0, Number(formData.get('wheel_unlucky_weight') ?? 0))
  const retryWeight = Math.max(0, Number(formData.get('wheel_retry_weight') ?? 0))
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ wheel_unlucky_weight: unluckyWeight, wheel_retry_weight: retryWeight })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/fidelite')
}

// Roue par QR (Fidélité v3) : toggle public + actions sociales + période de rejeu.
// Même contrainte RLS que updateWheelSettings/updateWheelWeights ci-dessus (pas de policy
// UPDATE tenant sur restaurants) → client admin après le même gate myRestaurantId + assertPlan.
export async function updateWheelQrSettings(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])

  const wheelQrPublic = formData.get('wheel_qr_public') === 'on'
  const actionGoogle = formData.get('wheel_action_google') === 'on'
  const actionTiktok = formData.get('wheel_action_tiktok') === 'on'
  const actionChannel = formData.get('wheel_action_channel') === 'on'
  const googleUrl = String(formData.get('wheel_google_url') ?? '').trim()
  const tiktokUrl = String(formData.get('wheel_tiktok_url') ?? '').trim()
  const channelUrl = String(formData.get('wheel_channel_url') ?? '').trim()
  const spinPeriodDays = Math.max(0, Math.trunc(Number(formData.get('wheel_spin_period_days') ?? 30)))

  for (const url of [googleUrl, tiktokUrl, channelUrl]) {
    if (url && !url.startsWith('http')) throw new Error('Lien invalide.')
  }

  if (wheelQrPublic) {
    const hasActiveAction =
      (actionGoogle && googleUrl) || (actionTiktok && tiktokUrl) || (actionChannel && channelUrl)
    if (!hasActiveAction) throw new Error('Activez au moins une action avec son lien.')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({
      wheel_qr_public: wheelQrPublic,
      wheel_action_google: actionGoogle,
      wheel_action_tiktok: actionTiktok,
      wheel_action_channel: actionChannel,
      wheel_google_url: googleUrl || null,
      wheel_tiktok_url: tiktokUrl || null,
      wheel_channel_url: channelUrl || null,
      wheel_spin_period_days: spinPeriodDays,
    })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/fidelite')
}

const MAX_PRIZE_IMAGE_BYTES = 4 * 1024 * 1024

// Image d'un lot (roue v2), même pattern que la photo menu (apps/web/src/app/app/menu/actions.ts)
// mais chemin déterministe par lot (bucket prize-media, policies scopées tenant, cf. migration 0017)
// pour que le remplacement d'une image écrase l'ancienne au lieu d'accumuler des fichiers orphelins.
export async function updatePrizeImage(prizeId: string, formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])

  const image = formData.get('image') as File | null
  if (!image || image.size === 0) return
  if (image.size > MAX_PRIZE_IMAGE_BYTES) throw new Error('Image trop lourde (max 4 Mo).')

  const ext = (image.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${restaurantId}/prizes/${prizeId}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('prize-media')
    .upload(path, image, { upsert: true, contentType: image.type || undefined })
  if (upErr) throw new Error(upErr.message)
  const imageUrl = supabase.storage.from('prize-media').getPublicUrl(path).data.publicUrl

  const { error } = await supabase.from('prizes').update({ image_url: imageUrl }).eq('id', prizeId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

// ─── Carte de fidélité à tampons (remplace la roue) ──────────────────────────

// Réglages de la carte : activation + cooldown anti-abus du QR de caisse. Même contrainte RLS
// que updateWheelSettings ci-dessus (pas de policy UPDATE tenant sur restaurants) → client admin
// après le gate myRestaurantId + assertPlan.
export async function updateLoyaltySettings(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const enabled = formData.get('loyalty_enabled') === 'on'
  const cooldownHours = Math.max(0, Math.trunc(Number(formData.get('loyalty_cooldown_hours') ?? 4)))
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ loyalty_enabled: enabled, loyalty_cooldown_hours: cooldownHours })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/fidelite')
}

const MAX_LOYALTY_IMAGE_BYTES = 4 * 1024 * 1024

// Logo / cover de la carte de fidélité : pattern EXACT de updatePrizeImage (bucket prize-media,
// policies scopées tenant, chemin déterministe pour écraser au lieu d'accumuler des orphelins).
export async function uploadLoyaltyImage(kind: 'logo' | 'cover', formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])

  const image = formData.get('image') as File | null
  if (!image || image.size === 0) return
  if (image.size > MAX_LOYALTY_IMAGE_BYTES) throw new Error('Image trop lourde (max 4 Mo).')

  const ext = (image.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${restaurantId}/loyalty/${kind}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('prize-media')
    .upload(path, image, { upsert: true, contentType: image.type || undefined })
  if (upErr) throw new Error(upErr.message)
  const publicUrl = supabase.storage.from('prize-media').getPublicUrl(path).data.publicUrl

  // Cache-buster : le chemin est déterministe (écrasé à chaque upload), donc l'URL publique
  // ne change pas → on force le rafraîchissement avec un suffixe de version.
  const url = `${publicUrl}?v=${Date.now()}`
  const column = kind === 'logo' ? 'loyalty_logo_url' : 'loyalty_cover_url'
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ [column]: url })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/fidelite')
}

// Régénère le code du QR de caisse : invalide l'ancien QR imprimé. Même contrainte RLS → admin.
export async function regenerateStampCode() {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const code = randomUUID().replace(/-/g, '')
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ loyalty_stamp_code: code })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Régénération impossible.')
  revalidatePath('/app/fidelite')
}

// ─── Paliers (loyalty_rewards) — modèle des prizes, sans poids/stock/image ────
// Écritures loyalty_rewards via le client RLS authentifié (policy tenant_all_loyalty_rewards).

export async function createReward(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const threshold = Math.max(1, Math.trunc(Number(formData.get('threshold') ?? 1)))
  const label = String(formData.get('label') ?? '').trim()
  if (!label) throw new Error('Libellé requis.')
  const { error } = await supabase.from('loyalty_rewards').insert({
    restaurant_id: restaurantId,
    threshold,
    label,
    active: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function updateReward(id: string, formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const threshold = Math.max(1, Math.trunc(Number(formData.get('threshold') ?? 1)))
  const label = String(formData.get('label') ?? '').trim()
  if (!label) throw new Error('Libellé requis.')
  const { error } = await supabase.from('loyalty_rewards')
    .update({ threshold, label })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function toggleReward(id: string, active: boolean) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('loyalty_rewards')
    .update({ active })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function deleteReward(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('loyalty_rewards')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

// Réordonner : monte/descend un palier en échangeant sa position avec son voisin.
export async function reorderRewards(id: string, direction: 'up' | 'down') {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { data: rows, error } = await supabase.from('loyalty_rewards')
    .select('id, position')
    .eq('restaurant_id', restaurantId)
    .order('position', { ascending: true })
    .order('threshold', { ascending: true })
  if (error) throw new Error(error.message)
  const list = rows ?? []
  const idx = list.findIndex((r) => r.id === id)
  if (idx === -1) return
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) return
  const a = list[idx]
  const b = list[swapIdx]
  // Positions normalisées sur l'index pour éviter les collisions (positions par défaut à 0).
  await supabase.from('loyalty_rewards').update({ position: swapIdx }).eq('id', a.id).eq('restaurant_id', restaurantId)
  await supabase.from('loyalty_rewards').update({ position: idx }).eq('id', b.id).eq('restaurant_id', restaurantId)
  revalidatePath('/app/fidelite')
}

// ─── Valider un lot (loyalty_redemptions) ────────────────────────────────────

export interface RedeemableTiers {
  found: boolean
  customerId: string | null
  customerName: string | null
  stamps: number
  tiers: { threshold: number; label: string; redeemed: boolean }[]
}

export async function findRedeemableTiers(phone: string): Promise<RedeemableTiers> {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const empty: RedeemableTiers = { found: false, customerId: null, customerName: null, stamps: 0, tiers: [] }

  const normalized = normalizeGabonPhone(phone)
  if (!normalized) return empty

  const { data: customer } = await supabase.from('customers')
    .select('id, name, loyalty_stamps')
    .eq('restaurant_id', restaurantId)
    .eq('phone', normalized)
    .maybeSingle()
  if (!customer) return empty

  const [{ data: rewards }, { data: redemptions }] = await Promise.all([
    supabase.from('loyalty_rewards')
      .select('threshold, label')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('threshold', { ascending: true }),
    supabase.from('loyalty_redemptions')
      .select('threshold')
      .eq('restaurant_id', restaurantId)
      .eq('customer_id', customer.id),
  ])

  const redeemed = new Set((redemptions ?? []).map((r) => r.threshold))
  const tiers = (rewards ?? []).map((r) => ({
    threshold: r.threshold,
    label: r.label,
    redeemed: redeemed.has(r.threshold),
  }))

  return {
    found: true,
    customerId: customer.id,
    customerName: customer.name ?? null,
    stamps: customer.loyalty_stamps ?? 0,
    tiers,
  }
}

// Marque un palier remis : résout le reward_id par (resto, threshold), insère la redemption avec
// redeemed_by = auth uid, en ignorant les doublons (unique(resto,customer,threshold)).
export async function redeemTier(customerId: string, threshold: number) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { data: reward } = await supabase.from('loyalty_rewards')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('threshold', threshold)
    .maybeSingle()

  const { error } = await supabase.from('loyalty_redemptions')
    .upsert(
      {
        restaurant_id: restaurantId,
        customer_id: customerId,
        reward_id: reward?.id ?? null,
        threshold,
        redeemed_by: user.id,
      },
      { onConflict: 'restaurant_id,customer_id,threshold', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
  revalidatePath('/app/fidelite')
}

export async function redeemCode(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  if (!code) throw new Error('Code requis')

  const { data: spin, error: spinError } = await supabase.from('wheel_spins')
    .select('id, expires_at')
    .eq('restaurant_id', restaurantId)
    .eq('code', code)
    .is('redeemed_at', null)
    .maybeSingle()
  if (spinError) throw new Error(spinError.message)
  if (!spin) throw new Error('Code invalide ou déjà utilisé.')
  if (spin.expires_at && new Date(spin.expires_at).getTime() < Date.now()) {
    throw new Error('Ce lot a expiré.')
  }

  const { data, error } = await supabase.from('wheel_spins')
    .update({ redeemed_at: new Date().toISOString(), redeemed_by: user.id })
    .eq('id', spin.id)
    .is('redeemed_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Code invalide ou déjà utilisé.')
  revalidatePath('/app/fidelite')
}
