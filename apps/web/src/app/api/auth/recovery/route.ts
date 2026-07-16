import { NextResponse } from 'next/server'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp, enforceRateLimit, recoveryRateKeys } from '@/lib/rate-limit'
import { SITE_BASE_URL } from '@/lib/site'

export const runtime = 'nodejs'

const NEUTRAL_RESPONSE = { ok: true } as const

/**
 * Retrouve un utilisateur par email via l'API auth admin. `@supabase/auth-js@2.110.0`
 * (vérifié dans node_modules/.pnpm, GoTrueAdminApi.d.ts) n'expose PAS de `getUserByEmail` —
 * seuls `listUsers`/`getUserById`/`createUser`/`generateLink` existent (même constat déjà fait
 * pour OB1, cf. `admin/restaurants/[id]/actions.ts:resendInvitation` qui utilise `getUserById`
 * à partir d'un `user_id` déjà connu). Ici on ne connaît que l'email : `listUsers` (défaut 50/
 * page selon la doc du SDK) est donc filtré manuellement. Le volume de comptes gérants de ce
 * produit (sales-led, un par restaurant) reste largement sous une seule page — `perPage: 1000`
 * couvre large sans pagination à écrire pour un besoin qui n'existera pas en pratique.
 */
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error || !data?.users) return null
  const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return match?.id ?? null
}

/**
 * POST /api/auth/recovery — mot de passe oublié en self-service (cf. spec § Sécurité et plan
 * Task OB2). INVARIANT DE SÉCURITÉ ABSOLU : la réponse est TOUJOURS `{ ok: true }`, quel que
 * soit le résultat réel (compte inexistant, pas de restaurant_members, contact_phone absent,
 * canal Whapi HS/inactif, generateLink en erreur, envoi Whapi échoué). Aucune branche ne doit
 * être observable côté client — sinon c'est une énumération de comptes. Les échecs réels sont
 * uniquement `console.error` côté serveur. La SEULE réponse différente autorisée est le 429
 * (rate-limit), qui ne dépend d'aucune donnée sur le compte — juste de l'IP appelante.
 *
 * Le lien de récupération n'est JAMAIS loggé ni renvoyé au client : c'est une clé d'accès, son
 * seul destinataire est le WhatsApp du resto (cf. sendInvitationWhatsapp dans OB1, même
 * gabarit : digits(contact_phone) + `@s.whatsapp.net`).
 */
export async function POST(req: Request) {
  const admin = createAdminClient()

  const rl = await enforceRateLimit(admin, recoveryRateKeys(clientIp(req.headers)))
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = (await req.json().catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()

  // Tout échec à partir d'ici est absorbé : la fonction se termine toujours par le même
  // NEUTRAL_RESPONSE, jamais par une erreur ou un corps différent.
  try {
    if (!email) {
      console.error('[auth-recovery] email manquant dans le corps de la requête')
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const userId = await findUserIdByEmail(admin, email)
    if (!userId) {
      console.error('[auth-recovery] aucun compte pour cet email (réponse neutre)')
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const { data: member } = await admin
      .from('restaurant_members')
      .select('restaurant_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!member) {
      console.error('[auth-recovery] aucun restaurant_members pour cet utilisateur (réponse neutre)')
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const { data: resto } = await admin
      .from('restaurants')
      .select('contact_phone')
      .eq('id', member.restaurant_id)
      .maybeSingle()
    const digits = (resto?.contact_phone ?? '').replace(/\D/g, '')
    if (!digits) {
      console.error('[auth-recovery] contact_phone absent pour ce restaurant (réponse neutre)')
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const { data: channel } = await admin
      .from('whapi_channels')
      .select('token_encrypted, status')
      .eq('restaurant_id', member.restaurant_id)
      .maybeSingle()
    if (!channel || channel.status !== 'active') {
      console.error('[auth-recovery] canal Whapi absent ou inactif pour ce restaurant (réponse neutre)')
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE_BASE_URL}/login/definir-mot-de-passe` },
    })
    if (linkErr || !link.properties) {
      console.error('[auth-recovery] generateLink a échoué', linkErr)
      return NextResponse.json(NEUTRAL_RESPONSE)
    }

    const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
    const whapi = new WhapiClient(token)
    const message = `Bonjour ! Vous avez demandé à réinitialiser votre mot de passe Goutatou. Voici votre lien : ${link.properties.action_link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`
    try {
      await whapi.sendText(`${digits}@s.whatsapp.net`, message)
    } catch (sendErr) {
      console.error('[auth-recovery] envoi WhatsApp échoué', sendErr)
    }

    return NextResponse.json(NEUTRAL_RESPONSE)
  } catch (err) {
    console.error('[auth-recovery] erreur inattendue (réponse neutre)', err)
    return NextResponse.json(NEUTRAL_RESPONSE)
  }
}
