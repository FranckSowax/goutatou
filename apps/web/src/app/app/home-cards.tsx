import { Banknote, CookingPot, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TINTS = {
  mint: 'bg-tint-mint',
  peach: 'bg-tint-peach',
  sky: 'bg-tint-sky',
  rose: 'bg-tint-rose',
} as const

const ICONS: Record<keyof typeof TINTS, LucideIcon> = {
  mint: Banknote,
  peach: CookingPot,
  sky: ShoppingBag,
  rose: Wallet,
}

/** Carte KPI pastel de l'Accueil (chiffre du jour). */
export function KpiCard({ tint, label, value }: { tint: keyof typeof TINTS; label: string; value: string }) {
  const Icon = ICONS[tint]
  return (
    <div className={cn(
      'flex flex-col gap-3 rounded-2xl p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md',
      TINTS[tint],
    )}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-card shadow-xs" aria-hidden="true">
        <Icon className="size-4.5 text-foreground/70" />
      </span>
      <div>
        <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
