'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, Home, ChartColumn, MessagesSquare, Settings, Bike, type LucideIcon } from 'lucide-react'

const ICONS = { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, Home, ChartColumn, MessagesSquare, Settings, Bike } satisfies Record<string, LucideIcon>
// `match` : préfixe utilisé pour l'état actif quand il diffère de `href` (ex. un lien qui
// pointe vers un sous-onglet précis mais doit rester actif sur toute la section).
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string }

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()
  return (
    <nav className={cn('gap-1', orientation === 'vertical' ? 'flex flex-col' : 'flex overflow-x-auto')}>
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const matchBase = item.match ?? item.href
        const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(matchBase)
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}>
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
