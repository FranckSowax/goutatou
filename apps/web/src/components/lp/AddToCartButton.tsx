'use client'
import { useState } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCart } from './CartProvider'
import type { LpMenuItem } from '@/lib/lp/data'

const triggerClassName =
  'inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-bold text-white sm:min-h-0 sm:px-3 sm:py-1'
const triggerStyle = { backgroundColor: 'var(--lp-primary)' }

export function AddToCartButton({ item }: { item: LpMenuItem }) {
  const { addItem } = useCart()

  // Plat sans suppléments disponibles : comportement inchangé.
  if (item.supplements.length === 0) {
    return (
      <button
        onClick={() => addItem({ menuItemId: item.id, name: item.name, unitPrice: item.price, supplements: [] })}
        aria-label={`Ajouter ${item.name} au panier`}
        className={triggerClassName}
        style={triggerStyle}
      >
        + Ajouter
      </button>
    )
  }

  return <AddToCartWithSupplements item={item} />
}

function AddToCartWithSupplements({ item }: { item: LpMenuItem }) {
  const { addItem } = useCart()
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function confirm() {
    const supplements = item.supplements.filter((s) => selectedIds.includes(s.id))
    addItem({ menuItemId: item.id, name: item.name, unitPrice: item.price, supplements })
    setSelectedIds([])
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button aria-label={`Ajouter ${item.name} au panier`} className={triggerClassName} style={triggerStyle}>
          + Ajouter
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {item.supplements.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                {s.name} +{formatFcfa(s.price)}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={confirm}>Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
