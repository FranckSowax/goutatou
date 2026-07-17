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
  // Sur le hub lui-même (/app/marketing), pas d'onglets : le hub a ses propres cartes d'entrée.
  if (pathname === '/app/marketing') return null
  return (
    <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
