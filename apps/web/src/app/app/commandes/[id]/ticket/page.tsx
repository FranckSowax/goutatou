import { formatFcfa } from '@goutatou/db/types'
import { createSupabaseServer } from '@/lib/supabase/server'
import { paymentTicketLine } from '@/lib/payment'
import { cn } from '@/lib/utils'
import { PrintOnLoad } from './print-on-load'

export const dynamic = 'force-dynamic'

const SUPPLEMENT_PREFIX = '↳ '

function heureLibreville(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville', dateStyle: 'short', timeStyle: 'short',
  })
}

/** Libellé du mode + détail (créneau Drive / adresse livraison), pour l'en-tête du ticket. */
function modeDetail(o: { mode: string; driveSlotLabel: string | null; deliveryAddress: string | null }): string {
  if (o.mode === 'drive') return `🚗 Drive${o.driveSlotLabel ? ` · ${o.driveSlotLabel}` : ''}`
  if (o.mode === 'livraison') return `🛵 Livraison${o.deliveryAddress ? ` · ${o.deliveryAddress}` : ''}`
  return '🥡 À emporter'
}

function TicketIndisponible() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-display text-lg font-semibold">Ticket indisponible.</p>
      <p className="text-sm text-muted-foreground">
        Cette commande est introuvable ou n&apos;appartient pas à votre restaurant.
      </p>
    </div>
  )
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}) {
  const { id } = await params
  const { print } = await searchParams
  const supabase = await createSupabaseServer()

  // Garde membre (défense en profondeur en plus de la RLS) : sans resto associé, pas de ticket.
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) return <TicketIndisponible />

  // Filtre explicite `restaurant_id` : le ticket ne fuit jamais hors du resto du membre, même si
  // la RLS venait à changer — deux gardes valent mieux qu'une pour une route qui expose le total.
  const { data: order } = await supabase
    .from('orders')
    .select(`order_number, status, mode, total, created_at, delivery_address,
             payment_method, payment_status, payment_ref,
             customers(name), drive_slots(label), order_items(name, qty, unit_price),
             restaurants(name, contact_phone)`)
    .eq('id', id)
    .eq('restaurant_id', member.restaurant_id)
    .order('position', { referencedTable: 'order_items', ascending: true })
    .maybeSingle()

  if (!order) return <TicketIndisponible />

  const customer = order.customers as unknown as { name: string | null } | null
  const slot = order.drive_slots as unknown as { label: string } | null
  const restaurant = order.restaurants as unknown as { name: string; contact_phone: string | null } | null
  const items = (order.order_items as { name: string; qty: number; unit_price: number }[]) ?? []
  const paiement = paymentTicketLine(order.payment_method, order.payment_status, order.payment_ref)

  return (
    <div className="flex flex-col items-center gap-4 print:block">
      <PrintOnLoad shouldPrint={print === '1'} />

      {/* Reçu — fond blanc / texte noir forcés, indépendant du thème sombre : c'est du papier. */}
      <div className="ticket-print mx-auto max-w-[80mm] bg-white p-4 text-black">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="font-display text-lg font-bold">{restaurant?.name ?? 'Goutatou'}</p>
          {restaurant?.contact_phone && <p className="text-xs">{restaurant.contact_phone}</p>}
        </div>

        <div className="my-2 border-t border-dashed border-black/40" />

        <div className="flex flex-col gap-0.5">
          <p className="text-center font-display text-2xl font-bold">#{order.order_number}</p>
          <p className="text-center text-xs">{heureLibreville(order.created_at)}</p>
          <p className="text-center text-xs font-medium">
            {modeDetail({
              mode: order.mode,
              driveSlotLabel: slot?.label ?? null,
              deliveryAddress: order.delivery_address,
            })}
          </p>
          {customer?.name && <p className="text-center text-xs">{customer.name}</p>}
        </div>

        <div className="my-2 border-t border-dashed border-black/40" />

        <ul className="flex flex-col gap-1 text-sm">
          {items.map((it, i) => {
            const isSupplement = it.name.startsWith(SUPPLEMENT_PREFIX)
            return (
              <li
                key={i}
                className={cn(
                  'flex items-baseline justify-between gap-2',
                  isSupplement && 'pl-3 text-xs text-black/70',
                )}
              >
                <span>{it.qty}× {it.name}</span>
                <span className="whitespace-nowrap tabular-nums">{formatFcfa(it.unit_price * it.qty)}</span>
              </li>
            )
          })}
        </ul>

        <div className="my-2 border-t border-dashed border-black/40" />

        <div className="flex items-baseline justify-between text-base font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatFcfa(order.total)}</span>
        </div>

        {paiement && <p className="mt-1 text-center text-xs font-medium">{paiement}</p>}

        <p className="mt-4 text-center text-xs">Merci ! 🙏</p>
      </div>
    </div>
  )
}
