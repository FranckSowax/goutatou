'use server'
import { revalidatePath } from 'next/cache'
import { encryptToken, decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlatformAdmin } from '../../actions'

function revalidateFiche(id: string) {
  revalidatePath(`/admin/restaurants/${id}`)
  revalidatePath('/admin/restaurants')
  revalidatePath('/admin')
}

/** Trim + null si vide — cohérent avec le pattern lp_config existant. */
function trimmedOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

export async function updateRestaurantProfile(id: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Le nom du restaurant est requis.')

  const { error } = await admin
    .from('restaurants')
    .update({
      name,
      address: trimmedOrNull(formData, 'address'),
      contact_phone: trimmedOrNull(formData, 'contact_phone'),
      hours_text: trimmedOrNull(formData, 'hours_text'),
      delivery_info: trimmedOrNull(formData, 'delivery_info'),
      drive_enabled: formData.get('drive_enabled') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidateFiche(id)
}

export async function updateBotMessages(id: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const { error } = await admin
    .from('restaurants')
    .update({
      bot_welcome: trimmedOrNull(formData, 'bot_welcome'),
      bot_info_extra: trimmedOrNull(formData, 'bot_info_extra'),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidateFiche(id)
}

export async function updateChannelToken(id: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const whapiToken = String(formData.get('whapi_token') ?? '').trim()
  if (!whapiToken) throw new Error('Le token du canal est requis.')

  const { error } = await admin
    .from('whapi_channels')
    .upsert(
      {
        restaurant_id: id,
        token_encrypted: encryptToken(whapiToken, process.env.TOKEN_ENCRYPTION_KEY!),
        status: 'active',
      },
      { onConflict: 'restaurant_id' }
    )
  if (error) throw new Error(error.message)

  revalidateFiche(id)
}

/**
 * Décrypte le token DANS l'action (jamais en clair côté client) et instancie
 * le client Whapi correspondant. Lève l'erreur FR fixe si le canal n'existe
 * plus / le token est absent.
 */
async function whapiClientForRestaurant(id: string): Promise<WhapiClient> {
  const admin = createAdminClient()
  const { data: channel } = await admin
    .from('whapi_channels')
    .select('token_encrypted')
    .eq('restaurant_id', id)
    .maybeSingle()
  if (!channel) throw new Error('Impossible de contacter Whapi — le canal n’existe peut-être plus.')
  const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
  return new WhapiClient(token)
}

/** Code d'appairage à distance — seul le code traverse vers le client. */
export async function getPairingCode(id: string, phone: string): Promise<{ code: string }> {
  await assertPlatformAdmin()
  const trimmedPhone = phone.trim()
  if (!trimmedPhone) throw new Error('Le numéro de téléphone est requis.')

  const whapi = await whapiClientForRestaurant(id)
  try {
    const { code } = await whapi.getLoginCode(trimmedPhone)
    if (!code) throw new Error('code manquant')
    // Mémorise le numéro sur le canal : c'est lui qui alimente les QR opt-in
    // (wa.me) côté dashboard — aucun autre chemin ne renseigne phone.
    const admin = createAdminClient()
    await admin.from('whapi_channels').update({ phone: trimmedPhone }).eq('restaurant_id', id)
    return { code }
  } catch {
    throw new Error('Impossible de contacter Whapi — le canal n’existe peut-être plus.')
  }
}

/** QR de connexion à distance en base64 — seule l'image traverse vers le client. */
export async function getLoginQrAction(id: string): Promise<{ base64: string }> {
  await assertPlatformAdmin()

  const whapi = await whapiClientForRestaurant(id)
  try {
    const { base64 } = await whapi.getLoginQr()
    if (!base64) throw new Error('base64 manquant')
    return { base64 }
  } catch {
    throw new Error('Impossible de contacter Whapi — le canal n’existe peut-être plus.')
  }
}

export async function updatePlan(id: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const plan = String(formData.get('plan') ?? 'starter')
  const status = String(formData.get('status') ?? 'active')
  if (!['starter', 'pro', 'premium'].includes(plan)) throw new Error('Plan invalide.')
  if (!['active', 'past_due', 'canceled'].includes(status)) throw new Error('Statut invalide.')

  const { error } = await admin
    .from('subscriptions')
    .upsert({ restaurant_id: id, plan, status }, { onConflict: 'restaurant_id' })
  if (error) throw new Error(error.message)

  revalidateFiche(id)
}

export async function updateWheelSettings(id: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const wheelEnabled = formData.get('wheel_enabled') === 'on'
  const trigger = Math.max(1, Number(formData.get('wheel_trigger_orders') ?? 5))

  const { error } = await admin
    .from('restaurants')
    .update({ wheel_enabled: wheelEnabled, wheel_trigger_orders: trigger })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidateFiche(id)
}

/** Suppression cascade (FK on delete cascade sur toutes les tables liées à restaurants). */
export async function deleteRestaurant(id: string) {
  await assertPlatformAdmin()
  const admin = createAdminClient()

  const { error } = await admin.from('restaurants').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/restaurants')
  revalidatePath('/admin')
}
