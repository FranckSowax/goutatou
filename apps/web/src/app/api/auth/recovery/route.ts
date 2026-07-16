import { NextResponse, after } from 'next/server'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp, enforceRateLimit, recoveryRateKeys } from '@/lib/rate-limit'
import { SITE_BASE_URL } from '@/lib/site'

export const runtime = 'nodejs'

const NEUTRAL_RESPONSE = { ok: true } as const

/**
 * Plancher de temps constant anti-timing-oracle. Le corps/status neutres étaient déjà
 * identiques sur tous les chemins, mais pas la latence : un email inexistant rendait la main
 * après un seul `listUsers` (~200-400 ms) alors qu'un compte configuré enchaînait plusieurs
 * requêtes DB + `generateLink` (aller-retour GoTrue), facteur >2 et stable — chronométrable par
 * un attaquant pour savoir si un compte existe. 700 ms couvre large le chemin le plus lent
 * mesuré ici (listUsers + jusqu'à 3 `select` + `generateLink`) ; l'envoi WhatsApp ne compte plus
 * dans ce budget car il est sorti de la requête via `after()` (cf. plus bas).
 */
const BUDGET_MS = 700

/**
 * Unique point de sortie neutre. Applique le plancher `BUDGET_MS` puis renvoie toujours le même
 * corps/status — en centralisant ici, aucun `return` de la fonction ne peut oublier le plancher
 * (c'est le point structurel : la protection ne doit pas dépendre de la discipline à chaque
 * `return`, cf. revue OB2). Seul le 429 du rate-limit (avant tout accès aux données du compte,
 * dépend uniquement de l'IP) reste en dehors de ce helper.
 */
async function neutral(t0: number): Promise<NextResponse> {
  const elapsed = Date.now() - t0
  const remaining = BUDGET_MS - elapsed
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  return NextResponse.json(NEUTRAL_RESPONSE)
}

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
  const t0 = Date.now()
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

  // Tout échec à partir d'ici est absorbé : la fonction se termine toujours par `neutral(t0)`,
  // jamais par une erreur, un corps différent, ni un `NextResponse.json(NEUTRAL_RESPONSE)`
  // direct qui contournerait le plancher de temps constant.
  try {
    if (!email) {
      console.error('[auth-recovery] email manquant dans le corps de la requête')
      return neutral(t0)
    }

    const userId = await findUserIdByEmail(admin, email)
    if (!userId) {
      console.error('[auth-recovery] aucun compte pour cet email (réponse neutre)')
      return neutral(t0)
    }

    const { data: member } = await admin
      .from('restaurant_members')
      .select('restaurant_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (!member) {
      console.error('[auth-recovery] aucun restaurant_members pour cet utilisateur (réponse neutre)')
      return neutral(t0)
    }

    const { data: resto } = await admin
      .from('restaurants')
      .select('contact_phone')
      .eq('id', member.restaurant_id)
      .maybeSingle()
    const digits = (resto?.contact_phone ?? '').replace(/\D/g, '')
    if (!digits) {
      console.error('[auth-recovery] contact_phone absent pour ce restaurant (réponse neutre)')
      return neutral(t0)
    }

    const { data: channel } = await admin
      .from('whapi_channels')
      .select('token_encrypted, status')
      .eq('restaurant_id', member.restaurant_id)
      .maybeSingle()
    if (!channel || channel.status !== 'active') {
      console.error('[auth-recovery] canal Whapi absent ou inactif pour ce restaurant (réponse neutre)')
      return neutral(t0)
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE_BASE_URL}/login/definir-mot-de-passe` },
    })
    if (linkErr || !link.properties) {
      console.error('[auth-recovery] generateLink a échoué', linkErr)
      return neutral(t0)
    }

    // L'envoi WhatsApp est sorti de la requête avec `after()` (Next 15, exporté par
    // `next/server` — vérifié dans node_modules/next/server.d.ts et next/dist/server/after,
    // version installée 15.5.20). Un simple fire-and-forget (promesse non attendue) ne
    // suffirait pas : sur Netlify/Lambda la promesse pendante est tuée au flush de la réponse.
    // `after()` garantit l'exécution jusqu'au bout après l'envoi de la réponse, ce qui a le
    // bénéfice de sécurité recherché ici : le POST externe vers whapi.cloud (~0,5-2 s) ne fait
    // plus partie du temps de réponse observable par le client, donc plus du tout partie du
    // canal temporel.
    const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
    const actionLink = link.properties.action_link
    const message = `Bonjour ! Vous avez demandé à réinitialiser votre mot de passe Goutatou. Voici votre lien : ${actionLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`
    after(async () => {
      try {
        const whapi = new WhapiClient(token)
        await whapi.sendText(`${digits}@s.whatsapp.net`, message)
      } catch (sendErr) {
        console.error('[auth-recovery] envoi WhatsApp échoué', sendErr)
      }
    })

    return neutral(t0)
  } catch (err) {
    console.error('[auth-recovery] erreur inattendue (réponse neutre)', err)
    return neutral(t0)
  }
}
