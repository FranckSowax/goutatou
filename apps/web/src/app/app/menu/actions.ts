'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'

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
    const path = `${restaurantId}/${Date.now()}-${photo.name}`
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
