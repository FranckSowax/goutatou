import { formatFcfa } from '@goutatou/db/types'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createCategory, createItem, deleteItem, toggleItemAvailable } from './actions'

export const dynamic = 'force-dynamic'

type MenuItem = {
  id: string
  name: string
  description: string | null
  price: number
  available: boolean
  photo_url: string | null
}

export default async function MenuPage() {
  const supabase = await createSupabaseServer()
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id, name, position, menu_items(id, name, description, price, available, photo_url)')
    .order('position')

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Menu</h1>

      {(categories ?? []).map((cat) => {
        const items = cat.menu_items as MenuItem[]
        return (
          <section key={cat.id} className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">{cat.name}</h2>

            {items.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <Card key={item.id} className="gap-0 overflow-hidden p-0">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="aspect-video w-full rounded-t-xl object-cover"
                      />
                    ) : (
                      <div className="aspect-video w-full rounded-t-xl bg-muted" aria-hidden="true" />
                    )}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display font-semibold">{item.name}</span>
                        <Badge variant={item.available ? 'success' : 'muted'}>
                          {item.available ? 'Disponible' : 'Rupture'}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}
                      <span className="font-bold text-primary">{formatFcfa(item.price)}</span>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <form action={toggleItemAvailable.bind(null, item.id, !item.available)}>
                          <Button type="submit" variant="outline" size="sm">
                            {item.available ? 'Rupture' : 'Disponible'}
                          </Button>
                        </form>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button type="button" variant="destructive" size="sm">
                              Suppr.
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Supprimer ce plat ?</DialogTitle>
                              <DialogDescription>
                                « {item.name} » sera définitivement supprimé du menu. Cette action est
                                irréversible.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button type="button" variant="outline">
                                  Annuler
                                </Button>
                              </DialogClose>
                              <form action={deleteItem.bind(null, item.id)}>
                                <Button type="submit" variant="destructive">
                                  Supprimer
                                </Button>
                              </form>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Card className="p-4">
              <form action={createItem} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="category_id" value={cat.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`name-${cat.id}`}>Nom du plat</Label>
                  <Input id={`name-${cat.id}`} name="name" required placeholder="Nom du plat" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`price-${cat.id}`}>Prix (FCFA)</Label>
                  <Input
                    id={`price-${cat.id}`}
                    name="price"
                    required
                    type="number"
                    min="0"
                    placeholder="Prix (FCFA)"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`description-${cat.id}`}>Description (optionnel)</Label>
                  <Textarea
                    id={`description-${cat.id}`}
                    name="description"
                    placeholder="Description (optionnel)"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`photo-${cat.id}`}>Photo (optionnel)</Label>
                  <Input id={`photo-${cat.id}`} name="photo" type="file" accept="image/*" />
                </div>
                <Button type="submit" className="sm:col-span-2">
                  Ajouter le plat
                </Button>
              </form>
            </Card>
          </section>
        )
      })}

      <Card className="p-4">
        <form action={createCategory} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-category-name">Nouvelle catégorie</Label>
            <Input id="new-category-name" name="name" required placeholder="Nouvelle catégorie" />
          </div>
          <Button type="submit">Créer</Button>
        </form>
      </Card>
    </div>
  )
}
