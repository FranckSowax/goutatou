import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Pos, type PosMenuCategory } from './pos'

export const dynamic = 'force-dynamic'

function Indisponible() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-display text-lg font-semibold">Aucun restaurant associé.</p>
      <p className="text-sm text-muted-foreground">Connectez-vous avec un compte membre d&apos;un restaurant.</p>
    </div>
  )
}

export default async function SurPlacePage() {
  const supabase = await createSupabaseServer()

  // Garde membre : sans resto associé, pas de caisse (défense en profondeur en plus de la RLS).
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) return <Indisponible />
  const restaurantId = member.restaurant_id as string

  const { data: cats } = await supabase
    .from('menu_categories')
    .select(
      'id, name, position, menu_items(id, name, price, available, position, photo_url, menu_supplements(id, name, price, available, position))',
    )
    .eq('restaurant_id', restaurantId)
    .order('position')

  const menu: PosMenuCategory[] = (cats ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: (
        (c.menu_items as {
          id: string; name: string; price: number; available: boolean; position: number; photo_url: string | null
          menu_supplements: { id: string; name: string; price: number; available: boolean; position: number }[] | null
        }[]) ?? []
      )
        .filter((i) => i.available)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          photoUrl: i.photo_url,
          supplements: (i.menu_supplements ?? [])
            .filter((s) => s.available)
            .sort((a, b) => a.position - b.position)
            .map((s) => ({ id: s.id, name: s.name, price: s.price })),
        })),
    }))
    .filter((c) => c.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Retour aux commandes">
          <Link href="/app/commandes">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-semibold">Caisse — Sur place</h1>
          <p className="text-sm text-muted-foreground">Prise de commande au comptoir</p>
        </div>
      </div>
      <Pos restaurantId={restaurantId} menu={menu} />
    </div>
  )
}
