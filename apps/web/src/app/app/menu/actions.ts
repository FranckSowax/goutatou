'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { positionUpdates } from '@/lib/reorder'
import { requireMember } from '@/lib/member'

/** Garde membre (employé compris) — résolution unifiée via `lib/member.ts`. */
async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await requireMember(supabase)
  return restaurantId
}

/**
 * Resync automatique du catalogue WhatsApp : toute modification du Menu qui change le contenu du
 * catalogue (plat créé/modifié/supprimé, photo, disponibilité) pose une demande de sync — le
 * worker catalog-sync du bot la réclame et republie les produits. Best-effort : un échec ici ne
 * doit jamais faire échouer la sauvegarde du Menu. Client admin requis (pas de policy UPDATE
 * tenant sur `restaurants`) ; no-op si le catalogue n'est pas activé pour ce resto.
 */
async function requestCatalogSync(restaurantId: string): Promise<void> {
  try {
    await createAdminClient()
      .from('restaurants')
      .update({ catalog_sync_requested_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .eq('catalog_enabled', true)
  } catch {
    // silencieux : la resync repassera à la prochaine modification (ou via /admin).
  }
}

export async function createCategory(formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  const { error } = await supabase.from('menu_categories').insert({
    restaurant_id: restaurantId,
    name: String(formData.get('name')),
    position: Number(formData.get('position') ?? 0),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function createItem(formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  let photoUrl: string | null = null
  const photo = formData.get('photo') as File | null
  if (photo && photo.size > 0) {
    const safeName = photo.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${restaurantId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('menu-photos').upload(path, photo)
    if (upErr) throw new Error(upErr.message)
    photoUrl = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl
  }
  const { error } = await supabase.from('menu_items').insert({
    restaurant_id: restaurantId,
    category_id: String(formData.get('category_id')),
    name: String(formData.get('name')),
    description: String(formData.get('description') ?? '') || null,
    price: Number(formData.get('price')),
    photo_url: photoUrl,
  })
  if (error) throw new Error(error.message)
  await requestCatalogSync(restaurantId)
  revalidatePath('/app/menu')
}

export async function toggleItemAvailable(itemId: string, available: boolean) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  const { error } = await supabase.from('menu_items').update({ available }).eq('id', itemId)
  if (error) throw new Error(error.message)
  await requestCatalogSync(restaurantId)
  revalidatePath('/app/menu')
}

export async function deleteItem(itemId: string) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()
  const { error } = await supabase.from('menu_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  await requestCatalogSync(restaurantId)
  revalidatePath('/app/menu')
}

export async function updateItem(id: string, formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()

  const { data: current, error: fetchError } = await supabase
    .from('menu_items')
    .select('category_id')
    .eq('id', id)
    .single()
  if (fetchError || !current) throw new Error(fetchError?.message ?? 'Plat introuvable')

  const categoryId = String(formData.get('category_id'))
  const updates: Record<string, unknown> = {
    name: String(formData.get('name')),
    description: String(formData.get('description') ?? '') || null,
    price: Number(formData.get('price')),
    category_id: categoryId,
  }

  if (categoryId !== current.category_id) {
    const { count, error: countError } = await supabase
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
    if (countError) throw new Error(countError.message)
    updates.position = count ?? 0
  }

  const { error } = await supabase.from('menu_items').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  await requestCatalogSync(restaurantId)
  revalidatePath('/app/menu')
}

export async function updateItemPhoto(id: string, formData: FormData) {
  const supabase = await createSupabaseServer()
  const restaurantId = await myRestaurantId()

  const photo = formData.get('photo') as File | null
  if (!photo || photo.size === 0) return

  const safeName = photo.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage.from('menu-photos').upload(path, photo)
  if (upErr) throw new Error(upErr.message)
  const photoUrl = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl

  const { error } = await supabase.from('menu_items').update({ photo_url: photoUrl }).eq('id', id)
  if (error) throw new Error(error.message)
  await requestCatalogSync(restaurantId)
  revalidatePath('/app/menu')
}

export async function reorderItems(categoryId: string, orderedIds: string[]) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const results = await Promise.all(
    positionUpdates(orderedIds).map(({ id, position }) =>
      supabase.from('menu_items').update({ position }).eq('id', id).eq('category_id', categoryId)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath('/app/menu')
}

export async function moveItem(itemId: string, toCategoryId: string, orderedTargetIds: string[]) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const { data: current, error: fetchError } = await supabase
    .from('menu_items')
    .select('category_id')
    .eq('id', itemId)
    .single()
  if (fetchError || !current) throw new Error(fetchError?.message ?? 'Plat introuvable')
  const sourceCategoryId = current.category_id

  const { error: moveError } = await supabase
    .from('menu_items')
    .update({ category_id: toCategoryId })
    .eq('id', itemId)
  if (moveError) throw new Error(moveError.message)

  const targetResults = await Promise.all(
    positionUpdates(orderedTargetIds).map(({ id, position }) =>
      supabase.from('menu_items').update({ position }).eq('id', id)
    )
  )
  const targetFailed = targetResults.find((r) => r.error)
  if (targetFailed?.error) throw new Error(targetFailed.error.message)

  if (sourceCategoryId !== toCategoryId) {
    const { data: remaining, error: remainingError } = await supabase
      .from('menu_items')
      .select('id')
      .eq('category_id', sourceCategoryId)
      .order('position')
    if (remainingError) throw new Error(remainingError.message)

    const sourceResults = await Promise.all(
      positionUpdates((remaining ?? []).map((row) => row.id)).map(({ id, position }) =>
        supabase.from('menu_items').update({ position }).eq('id', id)
      )
    )
    const sourceFailed = sourceResults.find((r) => r.error)
    if (sourceFailed?.error) throw new Error(sourceFailed.error.message)
  }

  revalidatePath('/app/menu')
}

export async function renameCategory(id: string, name: string) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const trimmed = name.trim()
  if (!trimmed) throw new Error('Le nom de la catégorie est requis')

  const { error } = await supabase.from('menu_categories').update({ name: trimmed }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function deleteCategory(id: string) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const { count, error: countError } = await supabase
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) throw new Error("Déplacez d'abord les plats de cette catégorie.")

  const { error } = await supabase.from('menu_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function reorderCategories(orderedIds: string[]) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const results = await Promise.all(
    positionUpdates(orderedIds).map(({ id, position }) =>
      supabase.from('menu_categories').update({ position }).eq('id', id)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath('/app/menu')
}

export async function createSupplement(itemId: string, formData: FormData) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const { data: item, error: itemError } = await supabase
    .from('menu_items')
    .select('id, restaurant_id')
    .eq('id', itemId)
    .single()
  if (itemError || !item) throw new Error('Plat introuvable')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Le nom du supplément est requis')

  const priceRaw = formData.get('price')
  const price = Number(priceRaw)
  if (!Number.isInteger(price) || price < 0) throw new Error('Le prix doit être un nombre entier positif')

  const { count, error: countError } = await supabase
    .from('menu_supplements')
    .select('id', { count: 'exact', head: true })
    .eq('menu_item_id', itemId)
  if (countError) throw new Error(countError.message)

  const { error } = await supabase.from('menu_supplements').insert({
    restaurant_id: item.restaurant_id,
    menu_item_id: itemId,
    name,
    price,
    position: (count ?? 0) + 1,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function updateSupplement(id: string, formData: FormData) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Le nom du supplément est requis')

  const priceRaw = formData.get('price')
  const price = Number(priceRaw)
  if (!Number.isInteger(price) || price < 0) throw new Error('Le prix doit être un nombre entier positif')

  const { error } = await supabase.from('menu_supplements').update({ name, price }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function deleteSupplement(id: string) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const { error } = await supabase.from('menu_supplements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function toggleSupplementAvailable(id: string, available: boolean) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

  const { error } = await supabase.from('menu_supplements').update({ available }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}
