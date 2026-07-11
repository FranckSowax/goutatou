'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { positionUpdates } from '@/lib/reorder'

async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return data.restaurant_id
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
  revalidatePath('/app/menu')
}

export async function toggleItemAvailable(itemId: string, available: boolean) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('menu_items').update({ available }).eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function deleteItem(itemId: string) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('menu_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/app/menu')
}

export async function updateItem(id: string, formData: FormData) {
  const supabase = await createSupabaseServer()
  await myRestaurantId()

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
