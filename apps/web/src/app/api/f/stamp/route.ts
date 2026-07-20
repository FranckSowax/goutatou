import { NextResponse } from 'next/server'
import { signLoyaltyToken, verifyLoyaltyToken } from '@goutatou/db/loyalty'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeGabonPhone } from '@/lib/lp/wa'
import { clientIp, enforceRateLimit, wheelUnlockRateKeys } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type StampBody = { token?: string; code?: string; phone?: string }

/**
 * Crédit +1 en caisse via QR fixe. Deux entrées :
 *  - `{ token }` : client déjà porteur de sa carte (localStorage) → verifyLoyaltyToken → rid/cid.
 *  - `{ code, phone }` : premier passage → resto par loyalty_stamp_code, upsert customer par
 *    (restaurant_id, phone), émission d'un token à stocker côté client.
 * L'anti-abus (1 tampon / cooldown) est atomique côté SQL (add_loyalty_stamp).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as StampBody | null
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[f-stamp] WHEEL_JWT_SECRET manquant')
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 500 })
  }

  const db = createAdminClient()
  const nowSec = Math.floor(Date.now() / 1000)

  let rid: string
  let cid: string
  // Token renvoyé au client : pour l'entrée par token on renvoie le token reçu (inchangé),
  // pour l'entrée par phone on en signe un nouveau une fois le customer résolu.
  let outToken: string

  if (body.token) {
    const claims = verifyLoyaltyToken(body.token, process.env.WHEEL_JWT_SECRET, nowSec)
    if (!claims) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })
    rid = claims.rid
    cid = claims.cid
    outToken = body.token

    // Rate-limit par IP + resto (endpoint public non authentifié).
    const rl = await enforceRateLimit(db, wheelUnlockRateKeys(rid, clientIp(req.headers)))
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    // Vérifie que la fidélité est active pour ce resto.
    const { data: resto } = await db
      .from('restaurants')
      .select('loyalty_enabled')
      .eq('id', rid)
      .maybeSingle()
    if (!resto || resto.loyalty_enabled !== true) {
      return NextResponse.json({ error: 'Carte de fidélité indisponible.' }, { status: 403 })
    }
  } else {
    const code = typeof body.code === 'string' ? body.code : ''
    if (!code) return NextResponse.json({ error: 'Code invalide.' }, { status: 400 })

    const phone = normalizeGabonPhone(body.phone ?? '')
    if (!phone) return NextResponse.json({ error: 'Numéro invalide.' }, { status: 400 })

    const { data: resto } = await db
      .from('restaurants')
      .select('id, loyalty_enabled')
      .eq('loyalty_stamp_code', code)
      .maybeSingle()
    if (!resto) return NextResponse.json({ error: 'Carte de fidélité indisponible.' }, { status: 404 })
    rid = resto.id

    // Rate-limit par IP + resto (avant toute écriture dans customers).
    const rl = await enforceRateLimit(db, wheelUnlockRateKeys(rid, clientIp(req.headers)))
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    if (resto.loyalty_enabled !== true) {
      return NextResponse.json({ error: 'Carte de fidélité indisponible.' }, { status: 403 })
    }

    // Upsert client par (restaurant_id, phone). À la création : chat_id WhatsApp uniquement.
    // PAS d'opt-in marketing ici : `loyalty_stamp_code` est affiché publiquement (QR en caisse),
    // donc n'importe qui peut poster un numéro arbitraire — le consentement marketing ne peut pas
    // être déduit d'un scan. On laisse le défaut de la colonne, comme la LP et le comptoir
    // (src/app/app/commandes/sur-place/actions.ts) qui omettent délibérément le champ.
    const { data: existing } = await db
      .from('customers')
      .select('id')
      .eq('restaurant_id', rid)
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      cid = existing.id
    } else {
      const { data: created, error: insErr } = await db
        .from('customers')
        .insert({
          restaurant_id: rid,
          phone,
          chat_id: `${phone}@s.whatsapp.net`,
          name: null,
          opted_out: false,
        })
        .select('id')
        .single()
      if (insErr || !created) {
        console.error('[f-stamp] insert client échoué', insErr)
        return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
      }
      cid = created.id
    }

    outToken = signLoyaltyToken({ rid, cid }, process.env.WHEEL_JWT_SECRET, nowSec)
  }

  const { data, error } = await db.rpc('add_loyalty_stamp', {
    p_restaurant_id: rid,
    p_customer_id: cid,
  })
  if (error) {
    const msg = String(error.message)
    if (msg.includes('cooldown')) {
      return NextResponse.json({ error: 'cooldown' }, { status: 429 })
    }
    if (msg.includes('customer_not_found')) {
      return NextResponse.json({ error: 'customer_not_found' }, { status: 404 })
    }
    console.error('[f-stamp] add_loyalty_stamp échoué', error)
    return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })
  }

  const row = data?.[0] as
    | { stamps: number; reached_threshold: number | null; reached_label: string | null }
    | undefined
  if (!row) return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })

  return NextResponse.json({
    stamps: row.stamps,
    reachedThreshold: row.reached_threshold,
    reachedLabel: row.reached_label,
    token: outToken,
  })
}
