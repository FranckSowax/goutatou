import { NextResponse } from 'next/server'
import { verifyLoyaltyToken } from '@goutatou/db/loyalty'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Mise à jour du profil client (nom + date de naissance) depuis la carte publique.
 * Authentifié par le jeton de carte (verifyLoyaltyToken) — aucun accès croisé resto :
 * l'update est scopé à (id = cid, restaurant_id = rid).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { token?: string; name?: string; birthdate?: string }
    | null
  if (!body?.token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })

  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[f-profile] WHEEL_JWT_SECRET manquant')
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 500 })
  }

  const claims = verifyLoyaltyToken(body.token, process.env.WHEEL_JWT_SECRET, Math.floor(Date.now() / 1000))
  if (!claims) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  // Date de naissance ignorée si le format n'est pas YYYY-MM-DD.
  const birthdate =
    typeof body.birthdate === 'string' && DATE_RE.test(body.birthdate) ? body.birthdate : null

  const db = createAdminClient()
  const { error } = await db
    .from('customers')
    .update({ name: name || null, birthdate })
    .eq('id', claims.cid)
    .eq('restaurant_id', claims.rid)
  if (error) {
    console.error('[f-profile] update client échoué', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
