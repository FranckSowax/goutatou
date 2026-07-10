import type { ReactNode } from 'react'
import { NavLinks, type NavItem } from '@/components/nav-links'

export function AppShell({ items, title, footer, children }: {
  items: NavItem[]; title: string; footer?: ReactNode; children: ReactNode
}) {
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-5 py-5 font-display text-xl font-semibold text-primary">{title}</div>
        <div className="flex-1 px-3"><NavLinks items={items} orientation="vertical" /></div>
        {footer ? <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground">{footer}</div> : null}
      </aside>
      {/* Topbar mobile */}
      <div className="sticky top-0 z-20 border-b border-border bg-card md:hidden">
        <div className="px-4 pt-3 font-display text-lg font-semibold text-primary">{title}</div>
        <div className="px-2 pb-2"><NavLinks items={items} orientation="horizontal" /></div>
      </div>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
