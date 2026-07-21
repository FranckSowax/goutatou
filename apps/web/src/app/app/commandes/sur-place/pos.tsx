'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Minus, Plus, ShoppingCart } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { addLine, cartTotal, removeLine, setQty, toCreateOrderItems, type PosCart } from './cart'
import { createCounterOrder } from './actions'

export interface PosMenuSupplement {
  id: string
  name: string
  price: number
}

export interface PosMenuItem {
  id: string
  name: string
  price: number
  photoUrl: string | null
  supplements: PosMenuSupplement[]
}

export interface PosMenuCategory {
  id: string
  name: string
  items: PosMenuItem[]
}

const EMPTY_CART: PosCart = { lines: [] }

// `restaurantId` est accepté pour cohérence avec le contrat Server→Client (POS4) mais n'est pas
// utilisé côté client : `createCounterOrder` (actions.ts) redérive toujours le resto du membre
// authentifié — jamais celui transmis par le POS — pour rester strictement multi-tenant.
export function Pos({ menu }: { restaurantId: string; menu: PosMenuCategory[] }) {
  const router = useRouter()
  const [activeCategoryId, setActiveCategoryId] = useState(menu[0]?.id ?? '')
  const [cart, setCart] = useState<PosCart>(EMPTY_CART)
  const [phone, setPhone] = useState('')
  const [supplementItem, setSupplementItem] = useState<PosMenuItem | null>(null)
  const [selectedSupplementIds, setSelectedSupplementIds] = useState<string[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeCategory = menu.find((c) => c.id === activeCategoryId) ?? menu[0]
  const total = cartTotal(cart)
  const lineCount = cart.lines.reduce((s, l) => s + l.qty, 0)

  function openSupplementPicker(item: PosMenuItem) {
    setSupplementItem(item)
    setSelectedSupplementIds([])
  }

  function toggleSupplement(id: string) {
    setSelectedSupplementIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function confirmSupplements() {
    if (!supplementItem) return
    const chosen = supplementItem.supplements.filter((s) => selectedSupplementIds.includes(s.id))
    setCart((c) => addLine(c, { menuItemId: supplementItem.id, name: supplementItem.name, unitPrice: supplementItem.price }, chosen))
    setSupplementItem(null)
  }

  function tapItem(item: PosMenuItem) {
    if (item.supplements.length > 0) {
      openSupplementPicker(item)
      return
    }
    setCart((c) => addLine(c, { menuItemId: item.id, name: item.name, unitPrice: item.price }, []))
  }

  async function handleSubmit() {
    if (cart.lines.length === 0 || pending) return
    setError(null)
    setPending(true)
    try {
      const fd = new FormData()
      fd.set('items', JSON.stringify(toCreateOrderItems(cart)))
      fd.set('phone', phone)
      const { orderId } = await createCounterOrder(fd)
      router.push(`/app/commandes/${orderId}/ticket?print=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commande impossible. Réessayez.')
      setPending(false)
    }
  }

  if (menu.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        Aucun plat disponible. Ajoutez des plats dans le Menu pour ouvrir la caisse.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-24 lg:flex-row lg:items-start lg:pb-0">
      {/* Catégories + plats */}
      <div className="min-w-0 flex-1">
        <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {menu.map((cat) => {
            const active = cat.id === activeCategory?.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  'min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {cat.name}
              </button>
            )
          })}
        </nav>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {activeCategory?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => tapItem(item)}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xs transition-colors hover:border-primary/40 active:translate-y-px"
            >
              <span className="relative block aspect-4/3 w-full overflow-hidden bg-muted">
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photoUrl} alt={item.name} className="absolute inset-0 size-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <ShoppingCart className="size-6" />
                  </span>
                )}
                <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-transform group-active:scale-95">
                  <Plus className="size-4" />
                </span>
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="font-medium leading-snug">{item.name}</span>
                <span className="tabular-nums font-display text-base font-semibold text-primary">
                  {formatFcfa(item.price)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Panier — colonne droite sur lg, tiroir repliable en bas sur mobile/tablette */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-border bg-card shadow-lg lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:rounded-2xl lg:border lg:shadow-xs',
          cartOpen ? 'max-h-[85vh]' : 'max-h-16',
          'overflow-hidden lg:max-h-none',
        )}
      >
        <button
          type="button"
          onClick={() => setCartOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 lg:hidden"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="size-4" />
            {lineCount} article{lineCount > 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums font-display font-semibold text-primary">{formatFcfa(total)}</span>
            {cartOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </span>
        </button>

        <div className={cn('flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-4 lg:max-h-[calc(100vh-8rem)]', cartOpen ? 'flex' : 'hidden', 'lg:flex')}>
          <p className="hidden font-display text-lg font-semibold lg:block">Panier</p>

          {cart.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun article pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {cart.lines.map((line) => {
                const lineUnitPrice = line.unitPrice + line.supplements.reduce((s, sup) => s + sup.price, 0)
                return (
                  <li key={line.key} className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{line.name}</p>
                        {line.supplements.length > 0 && (
                          <p className="truncate text-xs text-muted-foreground">
                            {line.supplements.map((s) => `+${s.name}`).join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap tabular-nums text-sm font-semibold">
                        {formatFcfa(lineUnitPrice * line.qty)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label="Retirer un"
                        onClick={() => setCart((c) => setQty(c, line.key, line.qty - 1))}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-6 text-center tabular-nums">{line.qty}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label="Ajouter un"
                        onClick={() => setCart((c) => setQty(c, line.key, line.qty + 1))}
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-muted-foreground"
                        onClick={() => setCart((c) => removeLine(c, line.key))}
                      >
                        Retirer
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-muted-foreground">Total</span>
            <span className="font-display text-2xl font-bold tabular-nums text-primary">{formatFcfa(total)}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-phone">Téléphone (optionnel)</Label>
            <Input
              id="pos-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+241 …"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">Laisser vide = client comptoir</p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="button"
            size="lg"
            disabled={cart.lines.length === 0 || pending}
            onClick={handleSubmit}
          >
            {pending ? 'Envoi…' : 'Valider'}
          </Button>
        </div>
      </div>

      {/* Sélecteur de suppléments */}
      <Dialog open={supplementItem !== null} onOpenChange={(open) => { if (!open) setSupplementItem(null) }}>
        <DialogContent>
          {supplementItem && (
            <>
              <DialogHeader>
                <DialogTitle>{supplementItem.name}</DialogTitle>
                <DialogDescription>Choisissez les suppléments (optionnel).</DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col gap-1">
                {supplementItem.supplements.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 rounded border-input accent-primary"
                        checked={selectedSupplementIds.includes(s.id)}
                        onChange={() => toggleSupplement(s.id)}
                      />
                      <span className="flex-1">{s.name}</span>
                      <span className="tabular-nums text-sm text-muted-foreground">+{formatFcfa(s.price)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button type="button" onClick={confirmSupplements}>Ajouter</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
