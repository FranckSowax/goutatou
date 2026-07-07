import { formatFcfa } from '@goutatou/db/types'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createCategory, createItem, deleteItem, toggleItemAvailable } from './actions'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const supabase = await createSupabaseServer()
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id, name, position, menu_items(id, name, description, price, available, photo_url)')
    .order('position')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold">Menu</h1>

      {(categories ?? []).map((cat) => (
        <section key={cat.id} className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">{cat.name}</h2>
          <ul className="flex flex-col gap-2">
            {(cat.menu_items as { id: string; name: string; description: string | null; price: number; available: boolean }[]).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b pb-2">
                <div>
                  <span className={item.available ? '' : 'line-through opacity-50'}>{item.name}</span>
                  <span className="ml-2 text-sm text-neutral-600">{formatFcfa(item.price)}</span>
                </div>
                <div className="flex gap-2">
                  <form action={toggleItemAvailable.bind(null, item.id, !item.available)}>
                    <button className="rounded border px-2 py-1 text-xs">
                      {item.available ? 'Rupture' : 'Disponible'}
                    </button>
                  </form>
                  <form action={deleteItem.bind(null, item.id)}>
                    <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Suppr.</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <form action={createItem} className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <input type="hidden" name="category_id" value={cat.id} />
            <input name="name" required placeholder="Nom du plat" className="rounded border p-2" />
            <input name="price" required type="number" min="0" placeholder="Prix (FCFA)" className="rounded border p-2" />
            <input name="description" placeholder="Description (optionnel)" className="col-span-2 rounded border p-2" />
            <input name="photo" type="file" accept="image/*" className="text-xs" />
            <button className="rounded bg-neutral-900 p-2 text-white">Ajouter le plat</button>
          </form>
        </section>
      ))}

      <form action={createCategory} className="flex gap-2">
        <input name="name" required placeholder="Nouvelle catégorie" className="flex-1 rounded border p-2" />
        <button className="rounded bg-neutral-900 px-4 text-white">Créer</button>
      </form>
    </div>
  )
}
