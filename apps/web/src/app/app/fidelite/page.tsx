import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Prizes } from './prizes'
import { RedeemForm } from './redeem-form'
import { updateWheelSettings } from './actions'

export const dynamic = 'force-dynamic'

export default async function FidelitePage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Roue de la fidélité</h1>
        <Card className="border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }
  const restaurantId = member!.restaurant_id

  const [{ data: prizes }, { data: restaurant }, { data: spins }] = await Promise.all([
    supabase.from('prizes').select('id, label, weight, stock, active').eq('restaurant_id', restaurantId).order('position'),
    supabase.from('restaurants').select('wheel_enabled, wheel_trigger_orders').eq('id', restaurantId).single(),
    supabase.from('wheel_spins')
      .select('code, created_at, prizes(label)')
      .eq('restaurant_id', restaurantId)
      .is('redeemed_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Roue de la fidélité</h1>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Réglages</h2>
        <Card className="p-4">
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

      <Prizes prizes={prizes ?? []} />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Valider un code</h2>
        <Card className="p-4">
          <RedeemForm />
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Gains en attente de validation</h2>
        <Card className="p-4">
          <ul className="flex flex-col gap-2 text-sm">
            {(spins ?? []).map((s) => (
              <li key={s.code} className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="font-mono tracking-widest">{s.code}</span>
                <span className="text-muted-foreground">
                  {(s.prizes as unknown as { label: string } | null)?.label ?? '—'}
                </span>
                <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString('fr-FR')}</span>
              </li>
            ))}
            {(!spins || spins.length === 0) && (
              <p className="text-muted-foreground">Aucun gain en attente.</p>
            )}
          </ul>
        </Card>
      </section>
    </div>
  )
}
