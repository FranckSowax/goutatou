'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate, type LucideIcon } from 'lucide-react'

const ICONS = { ClipboardList, UtensilsCrossed, Megaphone, Gift, Camera, Store, LayoutTemplate } satisfies Record<string, LucideIcon>
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname()
  return (
    <nav className={cn('gap-1', orientation === 'vertical' ? 'flex flex-col' : 'flex overflow-x-auto')}>
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const active = pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}>
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
