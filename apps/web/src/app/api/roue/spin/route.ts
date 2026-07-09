import { NextResponse } from 'next/server'
import { verifyWheelToken } from '@goutatou/db/wheel'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const token = (body as { t?: string })?.t
  if (!token) return NextResponse.json({ error: 'Lien invalide.' }, { status: 400 })
  const claims = verifyWheelToken(token, process.env.WHEEL_JWT_SECRET!, Math.floor(Date.now() / 1000))
  if (!claims) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 })

  const db = createAdminClient()
  const { data, error } = await db.rpc('spin_wheel', {
    p_restaurant_id: claims.rid, p_customer_id: claims.cid, p_jti: claims.jti,
  })
  if (error) {
    const msg = String(error.message)
    if (msg.includes('already_spun')) return NextResponse.json({ error: 'Vous avez déjà tourné la roue.' }, { status: 409 })
    if (msg.includes('no_prize')) return NextResponse.json({ error: 'Aucun lot disponible pour le moment.' }, { status: 409 })
    return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })
  }
  const row = data?.[0] as { prize_id: string; label: string; code: string } | undefined
  if (!row) return NextResponse.json({ error: 'Une erreur est survenue.' }, { status: 500 })

  // Envoi du code par WhatsApp best-effort
  const { data: customer } = await db.from('customers').select('chat_id').eq('id', claims.cid).single()
  const { data: channel } = await db.from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', claims.rid).single()
  if (customer && channel?.status === 'active') {
    try {
      await new WhapiClient(decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))
        .sendText(customer.chat_id, `🎁 Vous avez gagné : *${row.label}* !\nVotre code : *${row.code}*\nPrésentez-le au restaurant pour en profiter.`)
    } catch (err) { console.error('[roue] envoi code échoué', err) }
  }

  return NextResponse.json({ prizeId: row.prize_id, label: row.label, code: row.code })
}
