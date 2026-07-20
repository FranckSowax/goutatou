'use server'
import { revalidatePath } from 'next/cache'
import { encryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SITE_BASE_URL } from '@/lib/site'

export async function assertPlatformAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non connecté')
  const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!data) throw new Error('Réservé aux admins plateforme')
}

/**
 * Crée le restaurant + son gérant, SANS mot de passe imposé : `generateLink({type:'invite'})`
 * crée l'utilisateur ET renvoie le lien en un seul appel (vérifié dans @supabase/auth-js@2.110.0,
 * doc de `generateLink` : "generateLink() handles the creation of the user for signup, invite
 * and magiclink") — pas besoin d'un `createUser` séparé. Le lien n'est JAMAIS loggé : il est
 * seulement retourné à l'appelant (affiché une fois, côté admin) — c'est une clé d'accès.
 * Reste de l'action (restaurants, restaurant_members owner, subscriptions, whapi_channels)
 * strictement inchangé.
 */
export async function createRestaurant(formData: FormData): Promise<{ inviteLink: string }> {
  await assertPlatformAdmin()
  const admin = createAdminClient()
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name'))
  const ownerEmail = String(formData.get('owner_email'))
  const whapiToken = String(formData.get('whapi_token'))

  const { data: resto, error: restoErr } = await admin
    .from('restaurants').insert({ slug, name }).select('id').single()
  if (restoErr || !resto) throw new Error(`Création resto : ${restoErr?.message}`)

  const { data: invite, error: inviteErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: ownerEmail,
    options: { redirectTo: `${SITE_BASE_URL}/login/definir-mot-de-passe` },
  })
  if (inviteErr || !invite.user || !invite.properties) {
    throw new Error(`Invitation du gérant : ${inviteErr?.message}`)
  }

  const { error: memberErr } = await admin.from('restaurant_members')
    .insert({ user_id: invite.user.id, restaurant_id: resto.id, role: 'owner' })
  if (memberErr) throw new Error(memberErr.message)

  const { error: subErr } = await admin.from('subscriptions').insert({ restaurant_id: resto.id })
  if (subErr) throw new Error(subErr.message)

  const { error: chanErr } = await admin.from('whapi_channels').insert({
    restaurant_id: resto.id,
    token_encrypted: encryptToken(whapiToken, process.env.TOKEN_ENCRYPTION_KEY!),
  })
  if (chanErr) throw new Error(chanErr.message)

  revalidatePath('/admin')
  return { inviteLink: invite.properties.action_link }
}

export async function configureWebhook(channelUuid: string, whapiToken: string) {
  await assertPlatformAdmin()
  // Secret partagé optionnel (miroir de WEBHOOK_SHARED_SECRET côté bot) : quand il est posé,
  // le bot exige `?s=<secret>` sur l'URL de webhook. Jamais loggé, jamais renvoyé au client —
  // il ne vit que dans l'URL enregistrée chez Whapi.
  const secret = process.env.WEBHOOK_SHARED_SECRET
  const webhookUrl = `${process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/${channelUuid}${
    secret ? `?s=${encodeURIComponent(secret)}` : ''
  }`
  const whapi = new WhapiClient(whapiToken)
  if (!(await whapi.checkHealth())) throw new Error('Canal Whapi injoignable (token invalide ?)')
  await whapi.setWebhook(webhookUrl)
  revalidatePath('/admin')
}
