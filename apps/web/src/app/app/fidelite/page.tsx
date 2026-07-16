import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { qrSvg } from '@/lib/qr'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageTabs } from '@/components/page-tabs'
import { Prizes } from './prizes'
import { RedeemForm } from './redeem-form'
import { WheelPreview } from './wheel-preview'
import { QrSection } from './qr-section'
import { Badge } from '@/components/ui/badge'
import { updateWheelSettings, updateWheelWeights } from './actions'

export const dynamic = 'force-dynamic'

const FIDELITE_TABS = ['roue', 'qr', 'codes'] as const
type FideliteTab = (typeof FIDELITE_TABS)[number]

function parseTab(raw: string | undefined): FideliteTab {
  return (FIDELITE_TABS as readonly string[]).includes(raw ?? '') ? (raw as FideliteTab) : 'roue'
}

export default async function FidelitePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = parseTab(tabParam)

  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Roue de la fidélité</h1>
        <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }
  const restaurantId = member!.restaurant_id

  const [{ data: prizesRaw }, { data: restaurant }, { data: spins }] = await Promise.all([
    supabase.from('prizes').select('id, label, weight, stock, active, image_url').eq('restaurant_id', restaurantId).order('position'),
    supabase.from('restaurants')
      .select(
        'wheel_enabled, wheel_trigger_orders, wheel_unlucky_weight, wheel_retry_weight, wheel_qr_public, wheel_action_google, wheel_action_tiktok, wheel_action_channel, wheel_google_url, wheel_tiktok_url, wheel_channel_url, wheel_spin_period_days, wa_channel_invite',
      )
      .eq('id', restaurantId).single(),
    supabase.from('wheel_spins')
      .select('code, created_at, expires_at, prizes(label)')
      .eq('restaurant_id', restaurantId)
      .eq('outcome', 'prize')
      .is('redeemed_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  const prizes = (prizesRaw ?? []).map((p) => ({ ...p, imageUrl: p.image_url }))
  const activePrizes = prizes.filter((p) => p.active)

  // QR imprimable : rendu côté serveur (jamais de fonction en prop, cf. lib/qr.ts) — même
  // pattern que l'invitation de chaîne (marketing/chaine/page.tsx). WHEEL_BASE_URL est déjà
  // utilisé par le bot (services/whatsapp) pour signer les liens de roue v2.
  const wheelQrPublic = restaurant?.wheel_qr_public ?? false
  const baseUrl = (process.env.WHEEL_BASE_URL ?? '').replace(/\/$/, '')
  const publicUrl = baseUrl ? `${baseUrl}/roue/${restaurantId}` : null
  const qrCodeSvg = publicUrl ? await qrSvg(publicUrl) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Roue de la fidélité</h1>

      <PageTabs
        tabs={[
          { value: 'roue', label: 'Roue & lots' },
          { value: 'qr', label: 'Roue QR' },
          { value: 'codes', label: 'Codes & gains' },
        ]}
        active={tab}
      />

      {tab === 'roue' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold">Réglages</h2>
              <Card className="rounded-2xl p-4">
                <form action={updateWheelSettings} className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="wheel_enabled"
                      defaultChecked={restaurant?.wheel_enabled ?? false}
                      className="size-4 accent-primary"
                    />
                    Activer la roue de la fidélité
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Label
                      htmlFor="wheel_trigger_orders"
                      className={wheelQrPublic ? 'font-normal text-muted-foreground' : 'font-normal'}
                    >
                      Déclencher après
                    </Label>
                    {/* readOnly (pas disabled) quand la roue QR est active : le champ reste inclus
                        dans le FormData au submit (valeur inchangée), sinon un `disabled` ferait
                        disparaître ce champ du formulaire et écraserait wheel_trigger_orders à 1
                        au prochain enregistrement des réglages ci-dessus. */}
                    <Input
                      id="wheel_trigger_orders"
                      name="wheel_trigger_orders"
                      type="number"
                      min="1"
                      defaultValue={restaurant?.wheel_trigger_orders ?? 5}
                      readOnly={wheelQrPublic}
                      aria-disabled={wheelQrPublic}
                      className={wheelQrPublic ? 'w-20 opacity-50' : 'w-20'}
                    />
                    commande(s) récupérée(s)
                    {wheelQrPublic && (
                      <span className="text-xs text-muted-foreground">(Remplacé par la roue QR)</span>
                    )}
                  </div>
                  <Button type="submit" className="w-fit">
                    Enregistrer
                  </Button>
                </form>
              </Card>
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold">Segments spéciaux</h2>
              <Card className="rounded-2xl p-4">
                <form action={updateWheelWeights} className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Ajoute des segments « Pas de chance » et « Rejouez ! » à la roue. Poids à 0 = segment désactivé.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Label htmlFor="wheel_unlucky_weight" className="font-normal">
                      Poids « Pas de chance »
                    </Label>
                    <Input
                      id="wheel_unlucky_weight"
                      name="wheel_unlucky_weight"
                      type="number"
                      min="0"
                      defaultValue={restaurant?.wheel_unlucky_weight ?? 0}
                      className="w-20"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Label htmlFor="wheel_retry_weight" className="font-normal">
                      Poids « Rejouez ! »
                    </Label>
                    <Input
                      id="wheel_retry_weight"
                      name="wheel_retry_weight"
                      type="number"
                      min="0"
                      defaultValue={restaurant?.wheel_retry_weight ?? 0}
                      className="w-20"
                    />
                  </div>
                  <Button type="submit" className="w-fit">
                    Enregistrer
                  </Button>
                </form>
              </Card>
            </section>

            <Prizes prizes={prizes} />
          </div>

          {/* Aperçu collé en haut de viewport sur desktop : il reste visible pendant qu'on
              règle les segments/lots à gauche — c'est tout l'intérêt du sticky ici. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-semibold">Aperçu de la roue</h2>
            <Card className="rounded-2xl p-4">
              <WheelPreview
                prizes={activePrizes}
                unluckyWeight={restaurant?.wheel_unlucky_weight ?? 0}
                retryWeight={restaurant?.wheel_retry_weight ?? 0}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <QrSection
          wheelQrPublic={wheelQrPublic}
          actionGoogle={restaurant?.wheel_action_google ?? false}
          actionTiktok={restaurant?.wheel_action_tiktok ?? false}
          actionChannel={restaurant?.wheel_action_channel ?? false}
          googleUrl={restaurant?.wheel_google_url ?? ''}
          tiktokUrl={restaurant?.wheel_tiktok_url ?? ''}
          channelUrl={restaurant?.wheel_channel_url || restaurant?.wa_channel_invite || ''}
          spinPeriodDays={restaurant?.wheel_spin_period_days ?? 30}
          svg={qrCodeSvg}
          publicUrl={publicUrl}
        />
      )}

      {tab === 'codes' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Valider un code</h2>
            <Card className="rounded-2xl p-4">
              <RedeemForm />
            </Card>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Gains en attente de validation</h2>
            <Card className="rounded-2xl p-4">
              <ul className="flex flex-col gap-2 text-sm">
                {(spins ?? []).map((s) => {
                  const expired = s.expires_at ? new Date(s.expires_at).getTime() < Date.now() : false
                  return (
                    <li key={s.code} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <span className="font-mono tracking-widest">{s.code}</span>
                      <span className="text-muted-foreground">
                        {(s.prizes as unknown as { label: string } | null)?.label ?? '—'}
                      </span>
                      <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString('fr-FR')}</span>
                      {s.expires_at && (
                        <Badge variant={expired ? 'destructive' : 'warning'}>
                          Expire le {new Date(s.expires_at).toLocaleDateString('fr-FR')}
                        </Badge>
                      )}
                    </li>
                  )
                })}
                {(!spins || spins.length === 0) && (
                  <p className="text-muted-foreground">Aucun gain en attente.</p>
                )}
              </ul>
            </Card>
          </section>
        </div>
      )}
    </div>
  )
}
