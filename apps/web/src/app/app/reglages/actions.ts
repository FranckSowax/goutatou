'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLatLng } from '@/lib/gps'

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
