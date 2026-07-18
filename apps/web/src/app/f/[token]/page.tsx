import { verifyLoyaltyToken } from '@goutatou/db/loyalty'
import { createAdminClient } from '@/lib/supabase/admin'
import { LoyaltyCard } from './loyalty-card'

export const dynamic = 'force-dynamic'

function Invalid() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
      <p className="text-muted-foreground">Ce lien de carte est invalide ou expiré.</p>
    </main>
  )
}

export default async function CartePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!process.env.WHEEL_JWT_SECRET) {
    console.error('[carte] WHEEL_JWT_SECRET manquant')
    return <Invalid />
  }
  const claims = verifyLoyaltyToken(token, process.env.WHEEL_JWT_SECRET, Math.floor(Date.now() / 1000))
  if (!claims) return <Invalid />

  const db = createAdminClient()

  const [{ data: resto }, { data: customer }, { data: rewards }, { data: redemptions }] =
    await Promise.all([
      db
        .from('restaurants')
        .select('name, loyalty_logo_url, loyalty_cover_url, lp_config')
        .eq('id', claims.rid)
        .maybeSingle(),
      db
        .from('customers')
        .select('name, birthdate, loyalty_stamps')
        .eq('id', claims.cid)
        .eq('restaurant_id', claims.rid)
        .maybeSingle(),
      db
        .from('loyalty_rewards')
        .select('threshold, label')
        .eq('restaurant_id', claims.rid)
        .eq('active', true)
        .order('threshold', { ascending: true }),
      db
        .from('loyalty_redemptions')
        .select('threshold')
        .eq('restaurant_id', claims.rid)
        .eq('customer_id', claims.cid),
    ])

  if (!resto || !customer) return <Invalid />

  return (
    <LoyaltyCard
      rid={claims.rid}
      token={token}
      restaurantName={resto.name ?? 'Restaurant'}
      logoUrl={resto.loyalty_logo_url}
      coverUrl={resto.loyalty_cover_url}
      stamps={customer.loyalty_stamps ?? 0}
      customerName={customer.name}
      birthdate={customer.birthdate}
      rewards={(rewards ?? []).map((r) => ({ threshold: r.threshold, label: r.label }))}
      redeemedThresholds={(redemptions ?? []).map((r) => r.threshold)}
    />
  )
}
