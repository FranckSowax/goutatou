import { cn } from '@/lib/utils'

const TINTS = {
  mint: 'bg-tint-mint',
  peach: 'bg-tint-peach',
  sky: 'bg-tint-sky',
  rose: 'bg-tint-rose',
} as const

/** Carte KPI pastel de l'Accueil (chiffre du jour). */
export function KpiCard({ tint, label, value }: { tint: keyof typeof TINTS; label: string; value: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-2xl p-4', TINTS[tint])}>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
