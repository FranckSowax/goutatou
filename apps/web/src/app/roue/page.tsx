import { verifyWheelToken } from '@goutatou/db/wheel'
import { createAdminClient } from '@/lib/supabase/admin'
import { Wheel } from './wheel'

export const dynamic = 'force-dynamic'

export default async function RouePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[roue] WHEEL_JWT_SECRET manquant')
    return <main className="flex min-h-screen items-center justify-center p-8 text-center"><p className="opacity-70">Ce lien de roue est invalide ou expiré.</p></main>
  }
  const claims = t ? verifyWheelToken(t, process.env.WHEEL_JWT_SECRET, Math.floor(Date.now() / 1000)) : null
  if (!t || !claims) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-center"><p className="opacity-70">Ce lien de roue est invalide ou expiré.</p></main>
  }
  const db = createAdminClient()
  const { data: resto } = await db.from('restaurants').select('name').eq('id', claims.rid).single()
  const { data: prizes } = await db.from('prizes')
    .select('id, label').eq('restaurant_id', claims.rid).eq('active', true).neq('stock', 0).order('position')
  const labels = (prizes ?? []).map((p) => p.label)
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-neutral-900 p-6 text-white">
      <h1 className="text-2xl font-bold">🎡 {resto?.name ?? 'Roue de la fortune'}</h1>
      <Wheel token={t} labels={labels} />
    </main>
  )
}
