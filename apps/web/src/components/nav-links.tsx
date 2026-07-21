'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePendingOrdersCount } from '@/components/notifications-bell'
import { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, Home, ChartColumn, MessagesSquare, Settings, Bike, Sparkles, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

const ICONS = { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, Home, ChartColumn, MessagesSquare, Settings, Bike, Sparkles, Users, UsersRound, Wallet } satisfies Record<string, LucideIcon>
// `match` : préfixe utilisé pour l'état actif quand il diffère de `href` (ex. un lien qui
// pointe vers un sous-onglet précis mais doit rester actif sur toute la section).
// `match` : préfixe utilisé pour l'état actif quand il diffère de `href`.
// `separatorAfter` : trace un séparateur juste après cet item (regroupement visuel de la nav).
// `badge` : source du compteur affiché à droite du libellé. Une clé (pas un nombre) parce que
// les items sont déclarés dans un Server Component : la valeur, elle, est temps réel côté client
// (cf. OrdersLiveProvider). La pastille disparaît à 0.
export type NavBadge = 'pendingOrders'
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string; separatorAfter?: boolean; ownerOnly?: boolean; badge?: NavBadge }

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()
  const pendingOrders = usePendingOrdersCount()
  return (
    <nav className={cn('gap-1', orientation === 'vertical' ? 'flex flex-col' : 'flex overflow-x-auto')}>
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const matchBase = item.match ?? item.href
        const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(matchBase)
        const badgeCount = item.badge === 'pendingOrders' ? pendingOrders : 0
        return (
          <div key={item.href} className={cn('flex', orientation === 'vertical' ? 'flex-col' : 'items-center')}>
            <Link href={item.href}
              className={cn(
                'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}>
              <Icon className="size-4 shrink-0" />
              {item.label}
              {badgeCount > 0 && (
                <span
                  aria-label={`${badgeCount} commande${badgeCount > 1 ? 's' : ''} en attente`}
                  className={cn(
                    'ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-xs font-bold tabular-nums',
                    active
                      ? 'bg-primary-foreground/25 text-primary-foreground'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
            {item.separatorAfter && (
              orientation === 'vertical'
                ? <div className="my-1.5 h-px bg-border" role="separator" />
                : <div className="mx-1 h-6 w-px shrink-0 bg-border" role="separator" />
            )}
          </div>
        )
      })}
    </nav>
  )
}
