import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { getClients } from './clients-data'
import { ClientsView } from './clients-view'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .maybeSingle()

  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }

  if (!(await isPro(supabase, member.restaurant_id))) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold">Clients</h1>
        <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-foreground">Fonctionnalité Pro</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Le répertoire clients (valeur, segments, notes et contact direct) est réservé aux offres Pro et
            Premium.
          </p>
        </div>
      </div>
    )
  }

  const clients = await getClients(supabase, member.restaurant_id)

  return <ClientsView clients={clients} />
}
