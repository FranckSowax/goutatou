import { createSupabaseServer } from '@/lib/supabase/server'
import { MenuManager } from './menu-manager'
import type { MenuStudioCategory } from './menu-studio'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const supabase = await createSupabaseServer()
  const { data: categories } = await supabase
    .from('menu_categories')
    .select(
      'id, name, position, menu_items(id, name, description, price, available, photo_url, position, menu_supplements(id, name, price, available, position))'
    )
    .order('position')
    .order('position', { referencedTable: 'menu_items' })

  const studioCategories: MenuStudioCategory[] = (categories ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    position: cat.position,
    items: (cat.menu_items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      description: item.description,
      photo_url: item.photo_url,
      available: item.available,
      position: item.position,
      supplements: (item.menu_supplements ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((supplement) => ({
          id: supplement.id,
          name: supplement.name,
          price: supplement.price,
          available: supplement.available,
          position: supplement.position,
        })),
    })),
  }))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Menu</h1>
      <MenuManager categories={studioCategories} />
    </div>
  )
}
