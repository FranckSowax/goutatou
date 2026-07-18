'use server'
import { revalidatePath } from 'next/cache'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertOwner } from '@/lib/roles'
import { staffEmailFromPhone } from '@/lib/staff-email'
import { normalizeGabonPhone } from '@/lib/lp/wa'
import { SITE_BASE_URL } from '@/lib/site'

type AdminClient = ReturnType<typeof createAdminClient>

const REDIRECT_TO = `${SITE_BASE_URL}/login/definir-mot-de-passe`

export interface InviteResult {
  link: string
  whatsappSent: boolean
}

/**
 * Envoie un lien (invitation/récupération) sur le WhatsApp d'un employé via le canal du resto —
 * best-effort. Décrypte le token du canal DANS l'action (jamais transmis au client) et instancie
 * le client Whapi correspondant, comme `whapiClientForRestaurant` côté admin. Renvoie `true` si
 * l'envoi a réussi, `false` sinon (le lien reste copiable côté patron en repli).
 */
async function sendStaffLinkWhatsapp(
  admin: AdminClient,
  restaurantId: string,
  digits: string,
  name: string | null,
  link: string,
): Promise<boolean> {
  try {
    const { data: channel } = await admin
      .from('whapi_channels')
      .select('token_encrypted')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (!channel) return false
    const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
    const whapi = new WhapiClient(token)
    const message = `Bonjour${name ? ' ' + name : ''} ! Voici votre lien pour activer votre accès employé Goutatou : ${link}`
    await whapi.sendText(`${digits}@s.whatsapp.net`, message)
    return true
  } catch {
    return false
  }
}

/**
 * Invite un employé : crée (ou retrouve) son compte GoTrue à partir de son numéro WhatsApp,
 * génère un lien d'activation et l'envoie sur son WhatsApp (best-effort). L'écriture de
 * l'appartenance passe par le client service_role (le patron n'a pas d'accès direct en écriture
 * sur restaurant_members — cf. RLS).
 */
export async function inviteStaff(formData: FormData): Promise<InviteResult> {
  const supabase = await createSupabaseServer()
  const owner = await assertOwner(supabase)
  const admin = createAdminClient()

  const name = String(formData.get('name') ?? '').trim()
  const phoneRaw = String(formData.get('phone') ?? '')

  const email = staffEmailFromPhone(phoneRaw)
  if (!email) throw new Error('Numéro WhatsApp invalide.')
  const digits = normalizeGabonPhone(phoneRaw)!

  // `type: 'invite'` crée le compte ET renvoie le lien quand l'utilisateur n'existe pas encore ;
  // s'il existe déjà (numéro réinvité), on retombe sur `type: 'recovery'` (même destination).
  let userId: string | null = null
  let actionLink: string | null = null

  const invite = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: REDIRECT_TO },
  })
  if (!invite.error && invite.data.user && invite.data.properties) {
    userId = invite.data.user.id
    actionLink = invite.data.properties.action_link
  } else {
    const recovery = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: REDIRECT_TO },
    })
    if (recovery.error || !recovery.data.user || !recovery.data.properties) {
      throw new Error("Impossible de générer le lien d'invitation.")
    }
    userId = recovery.data.user.id
    actionLink = recovery.data.properties.action_link
  }

  const { error: memberErr } = await admin.from('restaurant_members').upsert(
    {
      user_id: userId,
      restaurant_id: owner.restaurantId,
      role: 'staff',
      display_name: name || null,
      phone: digits,
      invited_by: owner.userId,
    },
    { onConflict: 'user_id,restaurant_id' },
  )
  if (memberErr) throw new Error(memberErr.message)

  const whatsappSent = await sendStaffLinkWhatsapp(admin, owner.restaurantId, digits, name || null, actionLink)

  revalidatePath('/app/equipe')
  return { link: actionLink, whatsappSent }
}

/** Retrouve un membre du resto du patron (garde tenant) — throw FR sinon. */
async function requireTeamMember(admin: AdminClient, restaurantId: string, userId: string) {
  const { data: member } = await admin
    .from('restaurant_members')
    .select('user_id, role, phone, display_name')
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!member) throw new Error('Membre introuvable dans votre équipe.')
  return member
}

/** Régénère un lien d'accès (recovery) et le renvoie sur le WhatsApp stocké de l'employé. */
export async function resendStaffLink(userId: string): Promise<InviteResult> {
  const supabase = await createSupabaseServer()
  const owner = await assertOwner(supabase)
  const admin = createAdminClient()

  const member = await requireTeamMember(admin, owner.restaurantId, userId)

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId)
  if (userErr || !userRes.user?.email) throw new Error("Impossible de retrouver le compte de l'employé.")

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: userRes.user.email,
    options: { redirectTo: REDIRECT_TO },
  })
  if (linkErr || !link.properties) throw new Error('Impossible de générer le lien.')
  const actionLink = link.properties.action_link

  const digits = (member.phone as string | null)?.replace(/\D/g, '') ?? ''
  const name = (member.display_name as string | null) ?? null
  const whatsappSent = digits
    ? await sendStaffLinkWhatsapp(admin, owner.restaurantId, digits, name, actionLink)
    : false

  revalidatePath('/app/equipe')
  return { link: actionLink, whatsappSent }
}

/** Retire un employé du restaurant. Jamais soi-même, jamais un patron (rétrograder d'abord). */
export async function removeStaff(userId: string): Promise<void> {
  const supabase = await createSupabaseServer()
  const owner = await assertOwner(supabase)
  const admin = createAdminClient()

  if (userId === owner.userId) throw new Error('Vous ne pouvez pas vous retirer vous-même.')

  const member = await requireTeamMember(admin, owner.restaurantId, userId)
  if (member.role === 'owner') throw new Error('Rétrogradez d’abord ce patron.')

  const { error } = await admin
    .from('restaurant_members')
    .delete()
    .eq('user_id', userId)
    .eq('restaurant_id', owner.restaurantId)
  if (error) throw new Error(error.message)

  revalidatePath('/app/equipe')
}

/**
 * Change le rôle d'un membre. En rétrogradation (`staff`), on refuse de retirer le dernier patron
 * du restaurant — il doit toujours rester au moins un owner.
 */
export async function setStaffRole(userId: string, role: 'owner' | 'staff'): Promise<void> {
  const supabase = await createSupabaseServer()
  const owner = await assertOwner(supabase)
  const admin = createAdminClient()

  const member = await requireTeamMember(admin, owner.restaurantId, userId)

  if (role === 'staff' && member.role === 'owner') {
    const { count } = await admin
      .from('restaurant_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('restaurant_id', owner.restaurantId)
      .eq('role', 'owner')
    if ((count ?? 0) <= 1) {
      throw new Error('Il doit rester au moins un patron — nommez un autre patron d’abord.')
    }
  }

  const { error } = await admin
    .from('restaurant_members')
    .update({ role })
    .eq('user_id', userId)
    .eq('restaurant_id', owner.restaurantId)
  if (error) throw new Error(error.message)

  revalidatePath('/app/equipe')
}
