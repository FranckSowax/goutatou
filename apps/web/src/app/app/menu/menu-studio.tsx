'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { arrayMove } from '@/lib/reorder'
import { deleteCategory, moveItem, renameCategory, reorderCategories, reorderItems, toggleItemAvailable } from './actions'

export type MenuStudioSupplement = {
  id: string
  name: string
  price: number
  available: boolean
  position: number
}

export type MenuStudioItem = {
  id: string
  name: string
  price: number
  description: string | null
  photo_url: string | null
  available: boolean
  position: number
  supplements: MenuStudioSupplement[]
}

export type MenuStudioCategory = {
  id: string
  name: string
  position: number
  items: MenuStudioItem[]
}

type DragData =
  | { type: 'category' }
  | { type: 'item'; categoryId: string }

type Transform = { x: number; y: number; scaleX: number; scaleY: number } | null

// Local equivalent of @dnd-kit/utilities CSS.Transform.toString, to avoid adding
// a third @dnd-kit package as a direct dependency.
function transformToCss(transform: Transform): string | undefined {
  if (!transform) return undefined
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
}

type MenuStudioProps = {
  categories: MenuStudioCategory[]
  // Map id plat → actions pré-rendues côté serveur. Une fonction de rendu
  // n'est PAS sérialisable RSC→client (crash prod « Functions cannot be
  // passed directly to Client Components ») ; des ReactNode le sont.
  itemActions?: Record<string, ReactNode>
}

export function MenuStudio({ categories, itemActions }: MenuStudioProps) {
  const [localCategories, setLocalCategories] = useState<MenuStudioCategory[]>(categories)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocalCategories(categories)
  }, [categories])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function rollback(message: string) {
    setLocalCategories(categories)
    setError(message)
  }

  function errorMessage(_e: unknown, fallback: string): string {
    // Next redige les messages d'erreur des Server Actions en prod (texte
    // anglais générique) : on affiche TOUJOURS le message FR fixe.
    return fallback
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeData = active.data.current as DragData | undefined
    const overData = over.data.current as DragData | undefined
    if (!activeData) return

    if (activeData.type === 'category') {
      const overCategoryId = overData?.type === 'category' ? String(over.id) : overData?.categoryId
      if (!overCategoryId) return

      const oldIndex = localCategories.findIndex((c) => c.id === active.id)
      const newIndex = localCategories.findIndex((c) => c.id === overCategoryId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const next = arrayMove(localCategories, oldIndex, newIndex)
      setLocalCategories(next)
      setError(null)
      reorderCategories(next.map((c) => c.id)).catch((e) =>
        rollback(errorMessage(e, 'Impossible de réordonner les catégories.'))
      )
      return
    }

    // Item drag
    const sourceCategoryId = activeData.categoryId
    const targetCategoryId = overData?.type === 'category' ? String(over.id) : overData?.categoryId
    if (!targetCategoryId) return

    if (sourceCategoryId === targetCategoryId) {
      const catIndex = localCategories.findIndex((c) => c.id === sourceCategoryId)
      if (catIndex === -1) return
      const items = localCategories[catIndex].items
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = overData?.type === 'item' ? items.findIndex((i) => i.id === over.id) : items.length - 1
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const nextItems = arrayMove(items, oldIndex, newIndex)
      const next = localCategories.map((c, idx) => (idx === catIndex ? { ...c, items: nextItems } : c))
      setLocalCategories(next)
      setError(null)
      reorderItems(sourceCategoryId, nextItems.map((i) => i.id)).catch((e) =>
        rollback(errorMessage(e, 'Impossible de réordonner les plats.'))
      )
      return
    }

    // Cross-category move
    const sourceIndex = localCategories.findIndex((c) => c.id === sourceCategoryId)
    const targetIndex = localCategories.findIndex((c) => c.id === targetCategoryId)
    if (sourceIndex === -1 || targetIndex === -1) return

    const movedItem = localCategories[sourceIndex].items.find((i) => i.id === active.id)
    if (!movedItem) return

    const sourceItems = localCategories[sourceIndex].items.filter((i) => i.id !== active.id)
    const targetItems = localCategories[targetIndex].items.slice()
    const overIndexInTarget = overData?.type === 'item' ? targetItems.findIndex((i) => i.id === over.id) : -1
    const insertIndex = overIndexInTarget === -1 ? targetItems.length : overIndexInTarget
    targetItems.splice(insertIndex, 0, movedItem)

    const next = localCategories.map((c, idx) => {
      if (idx === sourceIndex) return { ...c, items: sourceItems }
      if (idx === targetIndex) return { ...c, items: targetItems }
      return c
    })
    setLocalCategories(next)
    setError(null)
    moveItem(
      String(active.id),
      targetCategoryId,
      targetItems.map((i) => i.id)
    ).catch((e) => rollback(errorMessage(e, 'Impossible de déplacer le plat.')))
  }

  async function handleRenameCategory(categoryId: string, name: string) {
    const trimmed = name.trim()
    const current = localCategories.find((c) => c.id === categoryId)
    if (!current || !trimmed || trimmed === current.name) return

    setLocalCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name: trimmed } : c)))
    setError(null)
    try {
      await renameCategory(categoryId, trimmed)
    } catch (e) {
      rollback(errorMessage(e, 'Impossible de renommer la catégorie.'))
    }
  }

  async function handleDeleteCategory(category: MenuStudioCategory) {
    if (category.items.length > 0) return
    try {
      await deleteCategory(category.id)
      setLocalCategories((prev) => prev.filter((c) => c.id !== category.id))
      setError(null)
    } catch (e) {
      rollback(errorMessage(e, 'Impossible de supprimer la catégorie.'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <DndContext id="menu-studio" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={localCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-6">
            {localCategories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                onRename={handleRenameCategory}
                onDelete={handleDeleteCategory}
                itemActions={itemActions}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function CategorySection({
  category,
  onRename,
  onDelete,
  itemActions,
}: {
  category: MenuStudioCategory
  onRename: (categoryId: string, name: string) => void
  onDelete: (category: MenuStudioCategory) => void
  itemActions?: Record<string, ReactNode>
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    data: { type: 'category' } satisfies DragData,
  })

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(category.name)

  const style = {
    transform: transformToCss(transform),
    transition,
  }

  function commitRename() {
    setEditing(false)
    onRename(category.id, draftName)
  }

  const hasItems = category.items.length > 0

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4',
        isDragging && 'opacity-60'
      )}
    >
      <header className="flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Réordonner ${category.name}`}
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        {editing ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              }
              if (e.key === 'Escape') {
                setDraftName(category.name)
                setEditing(false)
              }
            }}
            className="h-8 max-w-xs"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-lg font-semibold">{category.name}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Renommer ${category.name}`}
              onClick={() => {
                setDraftName(category.name)
                setEditing(true)
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        )}

        <Badge variant="muted">{category.items.length}</Badge>

        <div className="ml-auto">
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            disabled={hasItems}
            title={hasItems ? "Déplacez d'abord les plats de cette catégorie." : 'Supprimer la catégorie'}
            aria-label={`Supprimer ${category.name}`}
            onClick={() => onDelete(category)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      <SortableContext items={category.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {category.items.map((item) => (
            <ItemRow key={item.id} item={item} categoryId={category.id} actions={itemActions?.[item.id]} />
          ))}
          {category.items.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Aucun plat — glissez un plat ici.
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

function ItemRow({
  item,
  categoryId,
  actions,
}: {
  item: MenuStudioItem
  categoryId: string
  actions?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'item', categoryId } satisfies DragData,
  })

  const style = {
    transform: transformToCss(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'grid grid-cols-[auto_40px_1fr_auto_auto_auto] items-center gap-3 rounded-xl border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40',
        isDragging && 'opacity-60'
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Réordonner ${item.name}`}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>

      {item.photo_url ? (
        <img
          src={item.photo_url}
          alt={item.name}
          className="size-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
      )}

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{item.name}</p>
          {item.supplements.length > 0 && (
            <Badge variant="outline" className="shrink-0">
              {item.supplements.length} suppl.
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>

      <span className="whitespace-nowrap font-bold text-primary">{formatFcfa(item.price)}</span>

      <form
        action={toggleItemAvailable.bind(null, item.id, !item.available)}
        onClick={(e) => e.stopPropagation()}
      >
        <Button type="submit" variant="outline" size="sm">
          {item.available ? 'Disponible' : 'Rupture'}
        </Button>
      </form>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  )
}
