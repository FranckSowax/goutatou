'use server'
import { revalidatePath } from 'next/cache'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLatLng } from '@/lib/gps'
import { normalizeGabonPhone } from '@/lib/lp/wa'

async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return data.restaurant_id
}

// Chaîne vide/absente → null (pas de valeur imposée), sinon trim.
function trimmedOrNull(formData: FormData, key: string): string | null {
  const raw = formData.get(key)
  if (raw == null) return null
  const trimmed = String(raw).trim()
  return trimmed === '' ? null : trimmed
}

export async function updateMyRestaurantProfile(formData: FormData) {
  const restaurantId = await myRestaurantId()

  const gpsRaw = String(formData.get('location_gps') ?? '').trim()
  let locationLat: number | null = null
  let locationLng: number | null = null
  if (gpsRaw) {
    const parsed = parseLatLng(gpsRaw)
    if (!parsed) {
      throw new Error('Coordonnées GPS invalides — collez-les au format 0.4162, 9.4673')
    }
    locationLat = parsed.lat
    locationLng = parsed.lng
  }

  // restaurants n'a pas de policy RLS UPDATE pour les membres tenant (seulement
  // restaurants_select et restaurants_admin_all) : le client RLS-bound matcherait
  // 0 ligne silencieusement. On utilise le client admin (service_role) après le
  // gate ci-dessus (myRestaurantId prouve déjà l'appartenance au restaurant),
  // comme pour /app/fidelite (pattern 3A).
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({
      address: trimmedOrNull(formData, 'address'),
      contact_phone: trimmedOrNull(formData, 'contact_phone'),
      hours_text: trimmedOrNull(formData, 'hours_text'),
      delivery_info: trimmedOrNull(formData, 'delivery_info'),
      location_lat: locationLat,
      location_lng: locationLng,
    })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/reglages')
}

/**
 * Crée le groupe WhatsApp « Cuisine {Resto} » : garde membre, décryptage du
 * token du canal DANS l'action (jamais transmis au client, mirror
 * chaine/actions.ts loadToken), createGroup + getGroupInvite (best-effort),
 * écriture conditionnelle via client admin (pattern 3A, anti double-clic).
 */
export async function createStaffGroup() {
  const supabase = await createSupabaseServer()
  const { data: member, error: memberErr } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .single()
  if (memberErr || !member) throw new Error('Aucun restaurant associé à ce compte')
  const restaurantId = member.restaurant_id as string

  const { data: resto, error: restoErr } = await supabase
    .from('restaurants')
    .select('name, contact_phone, staff_group_id')
    .eq('id', restaurantId)
    .single()
  if (restoErr || !resto) throw new Error('Restaurant introuvable.')
  if (resto.staff_group_id) {
    // Déjà créé (course gagnée par un autre appel) : rien à faire.
    revalidatePath('/app/reglages')
    return
  }

  // WhatsApp exige au moins un participant autre que soi-même à la création
  // (whapi.createGroup(subject, participants) — voir packages/whapi/src/client.ts,
  // participants requis non vide). On utilise le téléphone de contact du
  // restaurant (Fiche pratique) comme premier membre du groupe : le patron
  // rejoint donc directement le groupe qu'il vient de créer.
  const contactPhone = resto.contact_phone?.trim()
  const digits = contactPhone?.replace(/\D/g, '') ?? ''
  if (!digits) {
    throw new Error(
      "Renseignez d'abord votre téléphone de contact dans la fiche pratique — il sera le premier membre du groupe."
    )
  }

  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token_encrypted')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!channel) throw new Error("Connectez d'abord votre canal WhatsApp.")
  const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)

  const whapi = new WhapiClient(token)
  let groupId: string
  try {
    const created = await whapi.createGroup(`Cuisine ${resto.name}`, [`${digits}@s.whatsapp.net`])
    if (!created.id) throw new Error('id manquant')
    groupId = created.id
  } catch {
    throw new Error('Impossible de créer le groupe — vérifiez que votre canal WhatsApp est connecté.')
  }

  // Lien d'invitation best-effort : un échec ici ne doit pas annuler la
  // création du groupe (le patron pourra toujours inviter depuis WhatsApp).
  let invite: string | undefined
  try {
    const inviteRes = await whapi.getGroupInvite(groupId)
    invite = inviteRes.invite
  } catch {
    invite = undefined
  }

  const admin = createAdminClient()
  // Écriture conditionnelle anti double-clic : si un appel concurrent a déjà
  // posé un staff_group_id, on ne l'écrase pas (course perdue = succès, le
  // groupe surnuméraire reste orphelin côté Whapi, sans effet chez nous).
  const { error } = await admin
    .from('restaurants')
    .update({ staff_group_id: groupId, staff_group_invite: invite ?? null })
    .eq('id', restaurantId)
    .is('staff_group_id', null)
  if (error) {
    throw new Error('Impossible de créer le groupe — vérifiez que votre canal WhatsApp est connecté.')
  }

  revalidatePath('/app/reglages')
}

/**
 * Livreurs — liste gérée par resto (table `livreurs`, RLS `is_member`). Le client Supabase
 * authentifié suffit (contrairement à `restaurants` qui n'a pas de policy UPDATE tenant). Le
 * numéro sert à envoyer la commande + l'itinéraire au livreur par WhatsApp depuis /app/livraison.
 */
export async function addLivreur(formData: FormData) {
  const restaurantId = await myRestaurantId()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Nom du livreur requis.')
  const phone = normalizeGabonPhone(String(formData.get('phone') ?? ''))
  if (!phone) throw new Error('Numéro invalide — format 077000000 ou 24177000000.')

  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('livreurs').insert({ restaurant_id: restaurantId, name, phone })
  if (error) throw new Error('Ajout impossible.')
  revalidatePath('/app/reglages')
  revalidatePath('/app/livraison')
}

export async function updateLivreur(id: string, formData: FormData) {
  await myRestaurantId() // gate membre ; la RLS restreint la ligne au resto du membre
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Nom du livreur requis.')
  const phone = normalizeGabonPhone(String(formData.get('phone') ?? ''))
  if (!phone) throw new Error('Numéro invalide — format 077000000 ou 24177000000.')

  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('livreurs').update({ name, phone }).eq('id', id)
  if (error) throw new Error('Modification impossible.')
  revalidatePath('/app/reglages')
  revalidatePath('/app/livraison')
}

export async function toggleLivreurActive(id: string, active: boolean) {
  await myRestaurantId()
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('livreurs').update({ active }).eq('id', id)
  if (error) throw new Error('Mise à jour impossible.')
  revalidatePath('/app/reglages')
  revalidatePath('/app/livraison')
}

/**
 * Meta Pixel ID du restaurant (public par nature — il finit dans le HTML de la LP). Garde membre,
 * validation : vide (efface) OU chiffres uniquement, 6+. Écrit `restaurants.meta_pixel_id` via le
 * client admin après le gate (même contrainte RLS que updateMyRestaurantProfile).
 */
export async function updateMetaPixelId(formData: FormData) {
  const restaurantId = await myRestaurantId()
  const raw = String(formData.get('meta_pixel_id') ?? '').trim()
  if (raw !== '' && !/^\d{6,}$/.test(raw)) {
    throw new Error('Pixel ID invalide — collez uniquement les chiffres de l’ID (6 chiffres minimum).')
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({ meta_pixel_id: raw === '' ? null : raw })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/reglages')
}

export async function updateMyBotMessages(formData: FormData) {
  const restaurantId = await myRestaurantId()
  // Même contrainte RLS que updateMyRestaurantProfile ci-dessus → client admin
  // après le même gate myRestaurantId.
  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({
      bot_welcome: trimmedOrNull(formData, 'bot_welcome'),
      bot_info_extra: trimmedOrNull(formData, 'bot_info_extra'),
    })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/reglages')
}
