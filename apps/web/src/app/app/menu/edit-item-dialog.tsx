'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
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
import {
  createSupplement,
  deleteSupplement,
  toggleSupplementAvailable,
  updateItem,
  updateItemPhoto,
} from './actions'
import type { MenuStudioCategory, MenuStudioItem, MenuStudioSupplement } from './menu-studio'

type EditItemDialogProps = {
  item: MenuStudioItem
  categoryId: string
  categories: MenuStudioCategory[]
}

export function EditItemDialog({ item, categoryId, categories }: EditItemDialogProps) {
  const [open, setOpen] = useState(false)
  const [supplements, setSupplements] = useState<MenuStudioSupplement[]>(item.supplements)
  const [supplementError, setSupplementError] = useState<string | null>(null)

  useEffect(() => {
    setSupplements(item.supplements)
  }, [item.supplements])

  function supplementErrorMessage(_e: unknown, fallback: string): string {
    // Next redige les messages d'erreur des Server Actions en prod (texte
    // anglais générique) : on affiche TOUJOURS le message FR fixe.
    return fallback
  }

  async function handleAddSupplement(formData: FormData) {
    setSupplementError(null)
    try {
      await createSupplement(item.id, formData)
    } catch (e) {
      setSupplementError(supplementErrorMessage(e, "Impossible d'ajouter le supplément."))
    }
  }

  async function handleToggleSupplement(supplement: MenuStudioSupplement) {
    const nextAvailable = !supplement.available
    const previous = supplements
    setSupplements((prev) =>
      prev.map((s) => (s.id === supplement.id ? { ...s, available: nextAvailable } : s))
    )
    setSupplementError(null)
    try {
      await toggleSupplementAvailable(supplement.id, nextAvailable)
    } catch (e) {
      setSupplements(previous)
      setSupplementError(
        supplementErrorMessage(e, 'Impossible de mettre à jour la disponibilité du supplément.')
      )
    }
  }

  async function handleDeleteSupplement(supplementId: string) {
    const previous = supplements
    setSupplements((prev) => prev.filter((s) => s.id !== supplementId))
    setSupplementError(null)
    try {
      await deleteSupplement(supplementId)
    } catch (e) {
      setSupplements(previous)
      setSupplementError(supplementErrorMessage(e, 'Impossible de supprimer le supplément.'))
    }
  }

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

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label>Suppléments</Label>

          {supplementError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {supplementError}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {supplements.map((supplement) => (
              <div
                key={supplement.id}
                className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{supplement.name}</span>
                <span className="whitespace-nowrap text-sm font-semibold text-primary">
                  {formatFcfa(supplement.price)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleSupplement(supplement)}
                >
                  {supplement.available ? 'Disponible' : 'Rupture'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Supprimer ${supplement.name}`}
                  onClick={() => handleDeleteSupplement(supplement.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {supplements.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun supplément pour ce plat.</p>
            )}
          </div>

          <form action={handleAddSupplement} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`new-supplement-name-${item.id}`}>Nom</Label>
              <Input
                id={`new-supplement-name-${item.id}`}
                name="name"
                required
                placeholder="Ex : Sauce piquante"
              />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor={`new-supplement-price-${item.id}`}>Prix (FCFA)</Label>
              <Input
                id={`new-supplement-price-${item.id}`}
                name="price"
                required
                type="number"
                min="0"
                placeholder="0"
              />
            </div>
            <Button type="submit">Ajouter</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
