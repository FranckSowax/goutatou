import { verifyWheelToken } from '@goutatou/db/wheel'
import { createAdminClient } from '@/lib/supabase/admin'
import { Wheel, type WheelSegment } from './wheel'

export const dynamic = 'force-dynamic'

export default async function RouePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[roue] WHEEL_JWT_SECRET manquant')
    return <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center"><p className="text-muted-foreground">Ce lien de roue est invalide ou expiré.</p></main>
  }
  const claims = t ? verifyWheelToken(t, process.env.WHEEL_JWT_SECRET, Math.floor(Date.now() / 1000)) : null
  if (!t || !claims) {
    return <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center"><p className="text-muted-foreground">Ce lien de roue est invalide ou expiré.</p></main>
  }
  const db = createAdminClient()
  const { data: resto } = await db.from('restaurants')
    .select('name, wheel_unlucky_weight, wheel_retry_weight').eq('id', claims.rid).single()
  const { data: prizes } = await db.from('prizes')
    .select('id, label, image_url').eq('restaurant_id', claims.rid).eq('active', true).neq('stock', 0).order('position')

  const segments: WheelSegment[] = [
    ...(prizes ?? []).map((p): WheelSegment => ({ kind: 'prize', id: p.id, label: p.label, imageUrl: p.image_url })),
    ...((resto?.wheel_unlucky_weight ?? 0) > 0 ? [{ kind: 'lose', label: 'Pas de chance' } as WheelSegment] : []),
    ...((resto?.wheel_retry_weight ?? 0) > 0 ? [{ kind: 'retry', label: 'Rejouez !' } as WheelSegment] : []),
  ]

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="font-display text-2xl text-foreground">🎡 {resto?.name ?? 'Roue de la fortune'}</h1>
      <Wheel token={t} segments={segments} />
    </main>
  )
}
