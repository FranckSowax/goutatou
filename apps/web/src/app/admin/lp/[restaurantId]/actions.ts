'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig, type LpConfig } from '@/lib/lp/config'
import { assertPlatformAdmin } from '../../actions'

async function loadRestaurant(admin: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const { data, error } = await admin
    .from('restaurants')
    .select('slug, name, lp_config')
    .eq('id', restaurantId)
    .single()
  if (error || !data) throw new Error(`Restaurant introuvable : ${error?.message}`)
  return data
}

export async function updateLpConfig(restaurantId: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()
  const resto = await loadRestaurant(admin, restaurantId)
  const current = parseLpConfig(resto.lp_config, resto.name)

  const aboutText = String(formData.get('about_text') ?? '').trim()
  const hoursRaw = String(formData.get('hours') ?? '')
  const hours = hoursRaw.split('\n').map((h) => h.trim()).filter(Boolean)
  const whatsappPhone = String(formData.get('whatsappPhone') ?? '').trim() || null
  const featuredIds = formData.getAll('featured').map(String).slice(0, 4)

  const next: LpConfig = {
    ...current,
    published: formData.get('published') === 'on',
    hero: {
      ...current.hero,
      title: String(formData.get('hero_title') ?? '').trim() || current.hero.title,
      subtitle: String(formData.get('hero_subtitle') ?? '').trim(),
    },
    about: aboutText
      ? { title: String(formData.get('about_title') ?? '').trim() || 'Notre histoire', text: aboutText }
      : null,
    featuredIds,
    infos: {
      address: String(formData.get('address') ?? '').trim() || null,
      hours,
      mapsUrl: String(formData.get('mapsUrl') ?? '').trim() || null,
    },
    theme: {
      ...current.theme,
      primary: String(formData.get('theme_primary') ?? current.theme.primary),
      bg: String(formData.get('theme_bg') ?? current.theme.bg),
      text: String(formData.get('theme_text') ?? current.theme.text),
      accent: String(formData.get('theme_accent') ?? current.theme.accent),
      font: formData.get('theme_font') === 'serif' ? 'serif' : 'sans',
    },
    whatsappPhone,
  }

  const { error } = await admin.from('restaurants').update({ lp_config: next }).eq('id', restaurantId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/r/' + resto.slug, 'layout')
}

export async function uploadHeroMedia(restaurantId: string, formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()
  const file = formData.get('hero') as File | null
  if (!file || file.size === 0) return

  const resto = await loadRestaurant(admin, restaurantId)
  const current = parseLpConfig(resto.lp_config, resto.name)

  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/hero-${Date.now()}-${safeName}`
  const { error: upErr } = await admin.storage.from('lp-media').upload(path, file)
  if (upErr) throw new Error(upErr.message)
  const mediaUrl = admin.storage.from('lp-media').getPublicUrl(path).data.publicUrl
  const mediaType: 'image' | 'video' = file.type.startsWith('video') ? 'video' : 'image'

  const next: LpConfig = {
    ...current,
    hero: { ...current.hero, mediaUrl, mediaType },
  }

  const { error } = await admin.from('restaurants').update({ lp_config: next }).eq('id', restaurantId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/r/' + resto.slug, 'layout')
}
