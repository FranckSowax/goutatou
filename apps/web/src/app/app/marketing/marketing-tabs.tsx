'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Onglet « Campagnes » masqué en attendant son redesign complet (page conservée dans
// campagnes/ mais inaccessible : campagnes/page.tsx redirige vers Statuts).
const TABS = [
  { href: '/app/marketing/statuts', label: 'Statuts WhatsApp' },
  { href: '/app/marketing/chaine', label: 'Chaîne WhatsApp' },
  { href: '/app/marketing/sondages', label: 'Sondages' },
  { href: '/app/marketing/qr', label: 'QR opt-in' },
] as const

export function MarketingTabs() {
  const pathname = usePathname()
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
