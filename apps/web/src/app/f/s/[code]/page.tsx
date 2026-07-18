import { createAdminClient } from '@/lib/supabase/admin'
import { StampClaim } from './stamp-claim'

export const dynamic = 'force-dynamic'

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
      <p className="text-muted-foreground">Carte de fidélité indisponible.</p>
    </main>
  )
}

export default async function ScanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = createAdminClient()

  const { data: resto } = await db
    .from('restaurants')
    .select('id, name, loyalty_enabled')
    .eq('loyalty_stamp_code', code)
    .maybeSingle()

  if (!resto || resto.loyalty_enabled !== true) {
    return <Unavailable />
  }

  return <StampClaim rid={resto.id} code={code} restaurantName={resto.name ?? 'Restaurant'} />
}
