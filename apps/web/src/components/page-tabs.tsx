'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface PageTabItem {
  value: string
  label: string
}

/**
 * Onglets horizontaux pilotés par un paramètre d'URL (`?tab=` par défaut), pas par le
 * pathname (contrairement à `marketing-tabs.tsx`). L'onglet actif est déterminé par le
 * Server Component parent (qui lit déjà `searchParams`) et passé en prop `active` — ce
 * composant n'appelle jamais `useSearchParams()`, pour éviter tout besoin de Suspense.
 *
 * `variant="underline"` (défaut) reprend EXACTEMENT le style visuel de `marketing-tabs.tsx`.
 * `variant="pills"` sert à différencier visuellement des sous-onglets imbriqués sous une
 * nav de section qui utilise déjà le style soulignés (ex. Statuts sous Marketing).
 */
export function PageTabs({
  param = 'tab',
  tabs,
  active,
  variant = 'underline',
}: {
  param?: string
  tabs: PageTabItem[]
  active: string
  variant?: 'underline' | 'pills'
}) {
  const pathname = usePathname()

  if (variant === 'pills') {
    return (
      <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {tabs.map((tab) => {
          const isActive = tab.value === active
          return (
            <Link
              key={tab.value}
              href={`${pathname}?${param}=${tab.value}`}
              scroll={false}
              className={cn(
                'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.value === active
        return (
          <Link
            key={tab.value}
            href={`${pathname}?${param}=${tab.value}`}
            scroll={false}
            className={cn(
              'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
