import type { ReactNode } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { NavLinks, type NavItem } from '@/components/nav-links'
import { HeaderSearch } from '@/components/header-search'
import { NotificationsBell } from '@/components/notifications-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function initialsFromEmail(email?: string | null): string {
  const local = (email ?? '').split('@')[0] ?? ''
  if (!local) return '?'
  const parts = local.split(/[.\-_]+/).filter(Boolean)
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : local.slice(0, 2)
  return letters.toUpperCase() || '?'
}

export function AppShell({ items, title, footer, userEmail, children }: {
  items: NavItem[]; title: string; footer?: ReactNode; userEmail?: string | null; children: ReactNode
}) {
  const initials = initialsFromEmail(userEmail)

  return (
    <div className="min-h-screen bg-background md:h-screen md:p-3 lg:p-4">
      <div className="flex min-h-screen flex-col md:h-full md:min-h-0 md:flex-row md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-sm">
        {/* Sidebar desktop */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm" aria-hidden="true">
              <span className="font-display text-base font-bold text-primary-foreground">G</span>
            </span>
            <span className="font-display text-xl font-bold tracking-tight">{title}</span>
          </div>
          <div className="flex-1 px-3 pt-2"><NavLinks items={items} orientation="vertical" /></div>
          {footer ? <div className="mx-3 mb-4 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">{footer}</div> : null}
        </aside>

        {/* Topbar mobile */}
        <div className="sticky top-0 z-20 border-b border-border bg-card md:hidden">
          <div className="px-4 pt-3 font-display text-lg font-semibold text-primary">{title}</div>
          <div className="px-2 pb-2"><NavLinks items={items} orientation="horizontal" /></div>
        </div>

        {/* Zone droite */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 flex-nowrap items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
            <div className="hidden min-w-0 flex-1 justify-center md:flex">
              <HeaderSearch />
            </div>
            <Link
              href="/app/commandes"
              aria-label="Rechercher une commande"
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden')}
            >
              <Search className="size-4" />
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <ThemeToggle />
              <NotificationsBell />
              <span
                className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm"
                aria-hidden="true"
              >
                {initials}
              </span>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto bg-background/60 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
