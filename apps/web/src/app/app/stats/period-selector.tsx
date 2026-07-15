'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const PERIODS = [7, 30, 90] as const

/** Sélecteur 7 j / 30 j / 90 j, navigue vers `?p=<n>` (jamais de prop fonction Server→Client). */
export function PeriodSelector({ active }: { active: 7 | 30 | 90 }) {
  return (
    <nav className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-xs">
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`/app/stats?p=${p}`}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            p === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p} j
        </Link>
      ))}
    </nav>
  )
}
