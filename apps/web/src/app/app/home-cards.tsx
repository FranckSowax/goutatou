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

/** Pastille de tendance : ▲ +12 % (vert), ▼ -8 % (rouge), — (discret) si `null`. */
function DeltaBadge({ delta, invert }: { delta: number | null; invert: boolean }) {
  if (delta === null) {
    return (
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        — <span className="font-normal">vs période précédente</span>
      </p>
    )
  }

  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
  const sign = delta > 0 ? '+' : ''
  const isGood = delta === 0 ? null : invert ? delta < 0 : delta > 0
  const colorClass = isGood === null ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive'

  return (
    <p className={cn('mt-1 text-xs font-medium', colorClass)}>
      {arrow} {sign}
      {delta} % <span className="font-normal text-muted-foreground">vs période précédente</span>
    </p>
  )
}

/**
 * Carte KPI pastel de l'Accueil (chiffre du jour) — aussi utilisée par /app/stats.
 * `delta` est optionnel : sans lui, le rendu est strictement identique à l'existant (rétrocompat
 * pour la page d'accueil). `invert` inverse la lecture couleur (utile pour un KPI où une hausse
 * est mauvaise, ex. taux d'annulation).
 */
export function KpiCard({
  tint,
  label,
  value,
  delta,
  invert = false,
}: {
  tint: keyof typeof TINTS
  label: string
  value: string
  delta?: number | null
  invert?: boolean
}) {
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
        {delta !== undefined && <DeltaBadge delta={delta} invert={invert} />}
      </div>
    </div>
  )
}
