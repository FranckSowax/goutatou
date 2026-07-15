import { NextResponse } from 'next/server'
import { mintRetryToken, verifyWheelToken } from '@goutatou/db/wheel'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import type { WheelAction } from '@goutatou/db/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEligibility } from '@/lib/wheel-eligibility'

const WHEEL_ACTIONS: WheelAction[] = ['google', 'tiktok', 'channel']

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const token = (body as { t?: string })?.t
  const action = (body as { action?: string })?.action
  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })
  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[roue] WHEEL_JWT_SECRET manquant')
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 500 })
  }
  const claims = verifyWheelToken(token, process.env.WHEEL_JWT_SECRET, Math.floor(Date.now() / 1000))
  if (!claims) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 })

  const db = createAdminClient()

  // Ré-vérification autoritaire de l'éligibilité pour les jetons QR public uniquement
  // (jti préfixé `qr:`). Les jetons v2 (`order`, sans préfixe) ne passent pas par ce
  // contrôle → zéro régression du flux existant.
  //
  // EXCLUSION des jetons de rejeu (`qr:<uuid>:r1`, cf. mintRetryToken) : le segment
  // « Rejouez ! » accorde un second tour AU SEIN du même passage — le client vient
  // justement d'enregistrer un wheel_spin, donc l'éligibilité le refuserait toujours et
  // le rejeu serait mort-né. Le rejeu reste borné par mintRetryToken (un seul `:r1`,
  // anti-chaîne) et par le jti single-use de spin_wheel.
  if (claims.jti.startsWith('qr:') && !claims.jti.includes(':r')) {
    const { data: resto } = await db
      .from('restaurants')
      .select('wheel_spin_period_days')
      .eq('id', claims.rid)
      .maybeSingle()
    const { data: lastSpin } = await db
      .from('wheel_spins')
      .select('created_at')
      .eq('customer_id', claims.cid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const eligibility = checkEligibility(
      lastSpin ? new Date(lastSpin.created_at) : null,
      resto?.wheel_spin_period_days ?? 30,
      new Date(),
    )
    if (!eligibility.eligible) {
      return NextResponse.json({ error: 'Vous avez déjà tourné.' }, { status: 409 })
    }
  }

  const { data, error } = await db.rpc('spin_wheel', {
    p_restaurant_id: claims.rid, p_customer_id: claims.cid, p_jti: claims.jti,
  })
  if (error) {
    const msg = String(error.message)
    // `already_spun_period` AVANT `already_spun` : le second est un préfixe du premier
    // (includes matcherait les deux). Levé par la garde atomique QR de spin_wheel
    // (migration 0029) — 1 tour / client / période, vérifié sous verrou.
    if (msg.includes('already_spun_period')) return NextResponse.json({ error: 'Vous avez déjà tourné.' }, { status: 409 })
    if (msg.includes('already_spun')) return NextResponse.json({ error: 'Vous avez déjà tourné la roue.' }, { status: 409 })
    if (msg.includes('no_prize')) return NextResponse.json({ error: 'Aucun lot disponible pour le moment.' }, { status: 409 })
    return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })
  }
  const row = data?.[0] as {
    prize_id: string | null; label: string | null; code: string | null
    outcome: 'prize' | 'lose' | 'retry'; expires_at: string | null
  } | undefined
  if (!row) return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })

  // Stat best-effort (roue QR uniquement) : marque la ligne comme issue du flux public,
  // avec l'action déclarée. Un échec ici est logué mais n'affecte jamais la réponse —
  // l'éligibilité ne dépend jamais de `source`.
  if (claims.jti.startsWith('qr:') && action && WHEEL_ACTIONS.includes(action as WheelAction)) {
    const { error: statErr } = await db
      .from('wheel_spins')
      .update({ source: 'qr_public', declared_action: action })
      .eq('jti', claims.jti)
    if (statErr) console.error('[roue] maj stat source/declared_action échouée', statErr)
  }

  if (row.outcome === 'lose') {
    return NextResponse.json({ outcome: 'lose' })
  }

  if (row.outcome === 'retry') {
    let retryToken: string | null = null
    try {
      retryToken = mintRetryToken(
        { rid: claims.rid, cid: claims.cid, jti: claims.jti },
        process.env.WHEEL_JWT_SECRET,
        Math.floor(Date.now() / 1000),
      )
    } catch {
      // Anti-chaîne : un jeton de rejeu ne peut jamais produire un nouveau rejeu.
      // On dégrade proprement en résultat "perdu" plutôt que de faire échouer l'appel.
      return NextResponse.json({ outcome: 'lose' })
    }
    return NextResponse.json({ outcome: 'retry', retryToken })
  }

  // outcome === 'prize'
  // Envoi du code par WhatsApp best-effort
  const { data: customer } = await db.from('customers').select('chat_id').eq('id', claims.cid).single()
  const { data: channel } = await db.from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', claims.rid).single()
  if (customer && channel?.status === 'active') {
    try {
      await new WhapiClient(decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))
        .sendText(customer.chat_id, `🎁 Vous avez gagné : *${row.label}* !\nVotre code : *${row.code}*\nPrésentez-le au restaurant pour en profiter.`)
    } catch (err) { console.error('[roue] envoi code échoué', err) }
  }

  return NextResponse.json({
    outcome: 'prize', prizeId: row.prize_id, label: row.label, code: row.code, expiresAt: row.expires_at,
  })
}
