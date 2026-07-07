'use server'
import { revalidatePath } from 'next/cache'
import { encryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

async function assertPlatformAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non connecté')
  const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!data) throw new Error('Réservé aux admins plateforme')
}

export async function createRestaurant(formData: FormData) {
  await assertPlatformAdmin()
  const admin = createAdminClient()
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name'))
  const ownerEmail = String(formData.get('owner_email'))
  const ownerPassword = String(formData.get('owner_password'))
  const whapiToken = String(formData.get('whapi_token'))

  const { data: resto, error: restoErr } = await admin
    .from('restaurants').insert({ slug, name }).select('id').single()
  if (restoErr || !resto) throw new Error(`Création resto : ${restoErr?.message}`)

  const { data: owner, error: userErr } = await admin.auth.admin.createUser({
    email: ownerEmail, password: ownerPassword, email_confirm: true,
  })
  if (userErr || !owner.user) throw new Error(`Création owner : ${userErr?.message}`)

  const { error: memberErr } = await admin.from('restaurant_members')
    .insert({ user_id: owner.user.id, restaurant_id: resto.id, role: 'owner' })
  if (memberErr) throw new Error(memberErr.message)

  const { error: subErr } = await admin.from('subscriptions').insert({ restaurant_id: resto.id })
  if (subErr) throw new Error(subErr.message)

  const { error: chanErr } = await admin.from('whapi_channels').insert({
    restaurant_id: resto.id,
    token_encrypted: encryptToken(whapiToken, process.env.TOKEN_ENCRYPTION_KEY!),
  })
  if (chanErr) throw new Error(chanErr.message)

  revalidatePath('/admin')
}

export async function configureWebhook(channelUuid: string, whapiToken: string) {
  await assertPlatformAdmin()
  const webhookUrl = `${process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/${channelUuid}`
  const whapi = new WhapiClient(whapiToken)
  if (!(await whapi.checkHealth())) throw new Error('Canal Whapi injoignable (token invalide ?)')
  await whapi.setWebhook(webhookUrl)
  revalidatePath('/admin')
}
