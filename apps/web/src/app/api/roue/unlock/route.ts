import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { signWheelToken } from '@goutatou/db/wheel'
import type { WheelAction } from '@goutatou/db/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEligibility } from '@/lib/wheel-eligibility'
import { normalizePhone } from '@/lib/wheel-phone'
import { formatExpiryFr } from '@/lib/wheel'

export const runtime = 'nodejs'

const ACTIONS: WheelAction[] = ['google', 'tiktok', 'channel']

const ACTION_ENABLED_COLUMN: Record<WheelAction, 'wheel_action_google' | 'wheel_action_tiktok' | 'wheel_action_channel'> = {
  google: 'wheel_action_google',
  tiktok: 'wheel_action_tiktok',
  channel: 'wheel_action_channel',
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { restaurantId?: string; phone?: string; action?: string } | null

  const action = body?.action
  if (!action || !ACTIONS.includes(action as WheelAction)) {
    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })
  }

  const phone = normalizePhone(body?.phone ?? '')
  if (!phone) {
    return NextResponse.json({ error: 'Numéro invalide.' }, { status: 400 })
  }

  const restaurantId = body?.restaurantId
  if (!restaurantId || typeof restaurantId !== 'string') {
    return NextResponse.json({ error: 'Roue indisponible.' }, { status: 404 })
  }

  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[roue-unlock] WHEEL_JWT_SECRET manquant')
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 500 })
  }

  const db = createAdminClient()

  const { data: resto } = await db
    .from('restaurants')
    .select('id, wheel_qr_public, wheel_spin_period_days, wheel_action_google, wheel_action_tiktok, wheel_action_channel')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!resto || resto.wheel_qr_public !== true) {
    return NextResponse.json({ error: 'Roue indisponible.' }, { status: 404 })
  }

  const actionEnabled = resto[ACTION_ENABLED_COLUMN[action as WheelAction]]
  if (actionEnabled !== true) {
    return NextResponse.json({ error: 'Action indisponible.' }, { status: 400 })
  }

  // Upsert client par téléphone (multi-tenant : toujours scopé à ce restaurant).
  // Opt-in marketing implicite : le client redonne volontairement son numéro.
  const { data: existing } = await db
    .from('customers')
    .select('id, opted_out')
    .eq('restaurant_id', resto.id)
    .eq('phone', phone)
    .maybeSingle()

  let customerId: string
  if (existing) {
    customerId = existing.id
    if (existing.opted_out === true) {
      const { error: updErr } = await db
        .from('customers')
        .update({ marketing_opt_in: true, opted_out: false })
        .eq('id', existing.id)
      if (updErr) {
        console.error('[roue-unlock] update opt-in échoué', updErr)
        return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
      }
    }
  } else {
    const { data: created, error: insErr } = await db
      .from('customers')
      .insert({
        restaurant_id: resto.id,
        phone,
        chat_id: `${phone}@s.whatsapp.net`,
        name: null,
        marketing_opt_in: true,
        opted_out: false,
      })
      .select('id')
      .single()
    if (insErr || !created) {
      console.error('[roue-unlock] insert client échoué', insErr)
      return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
    }
    customerId = created.id
  }

  // Éligibilité : dernier tour du client, sans filtre sur `source` (fail-safe).
  const { data: lastSpin } = await db
    .from('wheel_spins')
    .select('created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eligibility = checkEligibility(
    lastSpin ? new Date(lastSpin.created_at) : null,
    resto.wheel_spin_period_days,
    new Date(),
  )
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error: `Vous avez déjà tourné. Revenez le ${formatExpiryFr(eligibility.nextEligibleAt.toISOString())}.`,
        nextEligibleAt: eligibility.nextEligibleAt.toISOString(),
      },
      { status: 409 },
    )
  }

  const token = signWheelToken(
    { rid: resto.id, cid: customerId, jti: `qr:${randomUUID()}`, ttlSec: 600 },
    process.env.WHEEL_JWT_SECRET,
    Math.floor(Date.now() / 1000),
  )

  return NextResponse.json({ token })
}
