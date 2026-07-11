'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
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
import { updateItem, updateItemPhoto } from './actions'
import type { MenuStudioCategory, MenuStudioItem } from './menu-studio'

type EditItemDialogProps = {
  item: MenuStudioItem
  categoryId: string
  categories: MenuStudioCategory[]
}

export function EditItemDialog({ item, categoryId, categories }: EditItemDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label={`Modifier ${item.name}`}>
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier {item.name}</DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            await updateItem(item.id, formData)
            setOpen(false)
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-name-${item.id}`}>Nom du plat</Label>
            <Input id={`edit-name-${item.id}`} name="name" required defaultValue={item.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-price-${item.id}`}>Prix (FCFA)</Label>
            <Input
              id={`edit-price-${item.id}`}
              name="price"
              required
              type="number"
              min="0"
              defaultValue={item.price}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-description-${item.id}`}>Description (optionnel)</Label>
            <Textarea
              id={`edit-description-${item.id}`}
              name="description"
              defaultValue={item.description ?? ''}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-category-${item.id}`}>Catégorie</Label>
            <Select name="category_id" defaultValue={categoryId}>
              <SelectTrigger id={`edit-category-${item.id}`} className="w-full">
                <SelectValue />
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
          <Button type="submit">Enregistrer</Button>
        </form>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label>Photo</Label>
          {item.photo_url && (
            <img
              src={item.photo_url}
              alt={item.name}
              className="size-20 rounded-lg object-cover"
            />
          )}
          <form action={updateItemPhoto.bind(null, item.id)} className="flex flex-col gap-2">
            <Input name="photo" type="file" accept="image/*" />
            <Button type="submit" variant="outline">
              Mettre à jour la photo
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
