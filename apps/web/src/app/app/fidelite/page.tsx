import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Prizes } from './prizes'
import { RedeemForm } from './redeem-form'
import { Badge } from '@/components/ui/badge'
import { updateWheelSettings, updateWheelWeights } from './actions'

export const dynamic = 'force-dynamic'

export default async function FidelitePage() {
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
      .select('wheel_enabled, wheel_trigger_orders, wheel_unlucky_weight, wheel_retry_weight')
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Roue de la fidélité</h1>

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
              <Label htmlFor="wheel_trigger_orders" className="font-normal">
                Déclencher après
              </Label>
              <Input
                id="wheel_trigger_orders"
                name="wheel_trigger_orders"
                type="number"
                min="1"
                defaultValue={restaurant?.wheel_trigger_orders ?? 5}
                className="w-20"
              />
              commande(s) récupérée(s)
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
  )
}
