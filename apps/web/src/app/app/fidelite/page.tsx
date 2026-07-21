import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { qrSvg } from '@/lib/qr'
import { SITE_BASE_URL } from '@/lib/site'
import { Card } from '@/components/ui/card'
import { PageTabs } from '@/components/page-tabs'
import { LoyaltySettings } from './loyalty-settings'
import { Rewards, type LoyaltyReward } from './rewards'
import { RedeemTierForm } from './redeem-tier-form'

export const dynamic = 'force-dynamic'

const FIDELITE_TABS = ['carte', 'paliers', 'valider'] as const
type FideliteTab = (typeof FIDELITE_TABS)[number]

function parseTab(raw: string | undefined): FideliteTab {
  return (FIDELITE_TABS as readonly string[]).includes(raw ?? '') ? (raw as FideliteTab) : 'carte'
}

export default async function FidelitePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = parseTab(tabParam)

  const supabase = await createSupabaseServer()
  // `maybeSingle()` comme les autres pages : `single()` levait sur un compte sans restaurant, et
  // la page retombait sur « Fonctionnalité Pro » — message trompeur pour un problème de compte.
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }

  const pro = await isPro(supabase, member.restaurant_id)
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Carte de fidélité</h1>
        <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }
  const restaurantId = member.restaurant_id

  const [{ data: restaurant }, { data: rewardsRaw }] = await Promise.all([
    supabase.from('restaurants')
      .select('loyalty_enabled, loyalty_stamp_code, loyalty_cooldown_hours, loyalty_logo_url, loyalty_cover_url')
      .eq('id', restaurantId).single(),
    supabase.from('loyalty_rewards')
      .select('id, threshold, label, active, position')
      .eq('restaurant_id', restaurantId)
      .order('position', { ascending: true })
      .order('threshold', { ascending: true }),
  ])

  const rewards = (rewardsRaw ?? []) as LoyaltyReward[]

  // QR de caisse : rendu côté serveur (jamais de fonction en prop, cf. lib/qr.ts). Le client scanne
  // ce QR fixe pour cumuler un tampon ; l'URL pointe sur la route publique /f/s/<code>.
  const stampCode = restaurant?.loyalty_stamp_code ?? null
  const stampUrl = stampCode ? `${SITE_BASE_URL.replace(/\/$/, '')}/f/s/${stampCode}` : null
  const qrCodeSvg = stampUrl ? await qrSvg(stampUrl) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Carte de fidélité</h1>

      <PageTabs
        tabs={[
          { value: 'carte', label: 'Carte' },
          { value: 'paliers', label: 'Paliers' },
          { value: 'valider', label: 'Valider un lot' },
        ]}
        active={tab}
      />

      {tab === 'carte' && (
        <LoyaltySettings
          enabled={restaurant?.loyalty_enabled ?? false}
          cooldownHours={restaurant?.loyalty_cooldown_hours ?? 4}
          logoUrl={restaurant?.loyalty_logo_url ?? null}
          coverUrl={restaurant?.loyalty_cover_url ?? null}
          qrSvg={qrCodeSvg}
          stampUrl={stampUrl}
        />
      )}

      {tab === 'paliers' && <Rewards rewards={rewards} />}

      {tab === 'valider' && (
        <section className="flex max-w-xl flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Valider un lot</h2>
          <Card className="rounded-2xl p-4">
            <RedeemTierForm />
          </Card>
        </section>
      )}
    </div>
  )
}
