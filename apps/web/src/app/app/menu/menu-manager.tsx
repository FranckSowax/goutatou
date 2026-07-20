'use client'

import { useState, useTransition } from 'react'
import { ImageOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { EditItemDialog } from './edit-item-dialog'
import { createCategory, createItem, deleteCategory, deleteItem, renameCategory, toggleItemAvailable } from './actions'
import type { MenuStudioCategory, MenuStudioItem } from './menu-studio'

// Message d'erreur générique des mutations (pattern livraison/board.tsx) : jamais de
// `error.message` brut — masqué par Next en prod, et illisible pour le gérant de toute façon.
const ACTION_ERROR = 'Action impossible — vérifiez votre connexion et réessayez.'

/** Interrupteur Disponible / Indisponible, accès direct sur la carte (un tap, sans ouvrir le modal). */
function AvailabilityToggle({ item }: { item: MenuStudioItem }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const on = item.available
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? 'Rendre indisponible' : 'Rendre disponible'}
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              await toggleItemAvailable(item.id, !on)
            } catch {
              setError(ACTION_ERROR)
            }
          })
        }}
        className="flex items-center gap-2 disabled:opacity-60"
      >
        <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
          <span className={cn('absolute top-0.5 size-5 rounded-full bg-background shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
        </span>
        <span className={cn('text-xs font-medium', on ? 'text-primary' : 'text-muted-foreground')}>
          {on ? 'Disponible' : 'Indisponible'}
        </span>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function DishCard({ item, category, categories }: { item: MenuStudioItem; category: MenuStudioCategory; categories: MenuStudioCategory[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-opacity', !item.available && 'opacity-60')}>
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_url} alt={item.name} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
        {!item.available && (
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            Indisponible
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-medium">{item.name}</p>
          <span className="shrink-0 font-display text-lg font-semibold text-primary">{formatFcfa(item.price)}</span>
        </div>
        {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <AvailabilityToggle item={item} />
          <div className="flex items-center gap-1">
            <EditItemDialog item={item} categoryId={category.id} categories={categories} />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Supprimer ${item.name}`}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Supprimer « ${item.name} » ?`)) return
                setError(null)
                startTransition(async () => {
                  try {
                    await deleteItem(item.id)
                  } catch {
                    setError(ACTION_ERROR)
                  }
                })
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}

function NewDishCard({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="size-6" />
          Ajouter un plat
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau plat</DialogTitle></DialogHeader>
        <form
          action={(fd) => {
            setError(null)
            startTransition(async () => {
              try {
                await createItem(fd)
                setOpen(false)
              } catch {
                setError(ACTION_ERROR)
              }
            })
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dish-name">Nom du plat</Label>
            <Input id="dish-name" name="name" required placeholder="Poulet Nyembwé" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dish-price">Prix (FCFA)</Label>
            <Input id="dish-price" name="price" type="number" min="0" required placeholder="3500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dish-desc">Description</Label>
            <Textarea id="dish-desc" name="description" rows={2} placeholder="Poulet mijoté, sauce noix de palme…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dish-photo">Photo</Label>
            <Input id="dish-photo" name="photo" type="file" accept="image/*" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="mt-1">Créer le plat</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewCategoryButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1">
          <Plus className="size-4" /> Catégorie
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle catégorie</DialogTitle></DialogHeader>
        <form
          action={(fd) => startTransition(async () => { await createCategory(fd); setOpen(false) })}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Nom de la catégorie</Label>
            <Input id="cat-name" name="name" required placeholder="Boissons" />
          </div>
          <Button type="submit" disabled={pending}>Créer</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CategoryActions({ category }: { category: MenuStudioCategory }) {
  const [renaming, setRenaming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-1">
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Renommer la catégorie"><Pencil className="size-3.5" /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Renommer « {category.name} »</DialogTitle></DialogHeader>
          <form
            action={(fd) => startTransition(async () => { await renameCategory(category.id, String(fd.get('name'))); setRenaming(false) })}
            className="flex flex-col gap-3"
          >
            <Input name="name" required defaultValue={category.name} />
            <Button type="submit" disabled={pending}>Enregistrer</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer la catégorie"><Trash2 className="size-3.5" /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer « {category.name} » ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            La catégorie et tous ses plats seront supprimés. Cette action est irréversible.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteError(null)
                startTransition(async () => {
                  try {
                    await deleteCategory(category.id)
                  } catch {
                    setDeleteError(ACTION_ERROR)
                  }
                })
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MenuManager({ categories }: { categories: MenuStudioCategory[] }) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '')
  const active = categories.find((c) => c.id === activeId) ?? categories[0]

  if (categories.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-muted-foreground">
          Aucune catégorie pour l’instant. Créez une première catégorie (Petit-déjeuner, Plats, Boissons…),
          puis ajoutez-y vos plats.
        </p>
        <NewCategoryButton />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Onglets = catégories */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveId(cat.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                cat.id === active?.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {cat.name}
              <span className="ml-1.5 text-xs opacity-70">{cat.items.length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {active && <CategoryActions category={active} />}
          <NewCategoryButton />
        </div>
      </div>

      {/* Grille de cartes de la catégorie active */}
      {active && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {active.items.map((item) => (
            <DishCard key={item.id} item={item} category={active} categories={categories} />
          ))}
          <NewDishCard categoryId={active.id} />
        </div>
      )}
    </div>
  )
}
