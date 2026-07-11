import { Trash2 } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase/server'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCategory, createItem, deleteItem } from './actions'
import { MenuStudio, type MenuStudioCategory } from './menu-studio'
import { EditItemDialog } from './edit-item-dialog'

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold">Menu</h1>
        <div className="flex items-center gap-2">
          <NewCategoryDialog />
          <NewItemDialog categories={studioCategories} />
        </div>
      </div>

      <MenuStudio
        categories={studioCategories}
        itemActions={Object.fromEntries(
          studioCategories.flatMap((cat) =>
            cat.items.map((item) => [
              item.id,
              <>
                <EditItemDialog item={item} categoryId={cat.id} categories={studioCategories} />
                <DeleteItemDialog item={item} />
              </>,
            ])
          )
        )}
      />
    </div>
  )
}

function NewCategoryDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Nouvelle catégorie
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle catégorie</DialogTitle>
        </DialogHeader>
        <form action={createCategory} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-category-name">Nom de la catégorie</Label>
            <Input id="new-category-name" name="name" required placeholder="Nouvelle catégorie" />
          </div>
          <Button type="submit">Créer</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewItemDialog({ categories }: { categories: MenuStudioCategory[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" disabled={categories.length === 0}>
          Nouveau plat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau plat</DialogTitle>
        </DialogHeader>
        <form action={createItem} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-category">Catégorie</Label>
            <Select name="category_id" defaultValue={categories[0]?.id}>
              <SelectTrigger id="new-item-category" className="w-full">
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-name">Nom du plat</Label>
            <Input id="new-item-name" name="name" required placeholder="Nom du plat" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-price">Prix (FCFA)</Label>
            <Input
              id="new-item-price"
              name="price"
              required
              type="number"
              min="0"
              placeholder="Prix (FCFA)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-description">Description (optionnel)</Label>
            <Textarea
              id="new-item-description"
              name="description"
              placeholder="Description (optionnel)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-photo">Photo (optionnel)</Label>
            <Input id="new-item-photo" name="photo" type="file" accept="image/*" />
          </div>
          <Button type="submit">Ajouter le plat</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteItemDialog({ item }: { item: { id: string; name: string } }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="icon-sm" aria-label={`Supprimer ${item.name}`}>
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer ce plat ?</DialogTitle>
          <DialogDescription>
            « {item.name} » sera définitivement supprimé du menu. Cette action est irréversible.
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
  )
}
