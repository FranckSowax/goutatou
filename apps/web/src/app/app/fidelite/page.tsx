import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Prizes } from './prizes'
import { redeemCode, updateWheelSettings } from './actions'

export const dynamic = 'force-dynamic'

export default async function FidelitePage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold">Roue de la fidélité</h1>
        <p className="mt-4 opacity-70">Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.</p>
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
      <h1 className="text-2xl font-bold">Roue de la fidélité</h1>

      <section className="rounded-lg bg-white p-4 shadow-xs">
        <h2 className="mb-3 text-lg font-semibold">Réglages</h2>
        <form action={updateWheelSettings} className="flex flex-col gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="wheel_enabled" defaultChecked={restaurant?.wheel_enabled ?? false} />
            Activer la roue de la fidélité
          </label>
          <label className="flex items-center gap-2">
            Déclencher après
            <input
              name="wheel_trigger_orders"
              type="number"
              min="1"
              defaultValue={restaurant?.wheel_trigger_orders ?? 5}
              className="w-20 rounded-sm border p-1"
            />
            commande(s) récupérée(s)
          </label>
          <button className="w-fit rounded-sm bg-neutral-900 px-4 py-2 text-white">Enregistrer</button>
        </form>
      </section>

      <Prizes prizes={prizes ?? []} />

      <section className="rounded-lg bg-white p-4 shadow-xs">
        <h2 className="mb-3 text-lg font-semibold">Valider un code</h2>
        <form action={redeemCode} className="flex gap-2">
          <input name="code" required placeholder="Code client" className="flex-1 rounded-sm border p-2 uppercase" />
          <button className="rounded-sm bg-neutral-900 px-4 text-white">Valider</button>
        </form>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-xs">
        <h2 className="mb-3 text-lg font-semibold">Gains en attente de validation</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {(spins ?? []).map((s) => (
            <li key={s.code} className="flex justify-between border-b pb-2">
              <span className="font-mono">{s.code}</span>
              <span className="opacity-70">{(s.prizes as unknown as { label: string } | null)?.label ?? '—'}</span>
              <span className="opacity-50">{new Date(s.created_at).toLocaleString('fr-FR')}</span>
            </li>
          ))}
          {(!spins || spins.length === 0) && <p className="opacity-60">Aucun gain en attente.</p>}
        </ul>
      </section>
    </div>
  )
}
