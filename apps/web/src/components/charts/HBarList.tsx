export interface HBarListPoint {
  label: string
  value: number
  display?: string
}

export interface HBarListProps {
  data: HBarListPoint[]
  valueFormat?: (n: number) => string
  ariaLabel: string
}

const defaultFormat = (n: number) => String(n)

/** Liste de barres horizontales (classement), server component, zéro JS client, sans SVG. */
export function HBarList({ data, valueFormat = defaultFormat, ariaLabel }: HBarListProps) {
  if (!data || data.length === 0) {
    return (
      <p role="img" aria-label={ariaLabel} className="text-sm text-muted-foreground">
        Pas de données
      </p>
    )
  }

  const max = Math.max(...data.map((d) => d.value), 0)
  const pct = (v: number) => (max <= 0 ? 0 : (v / max) * 100)

  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {data.map((d, i) => {
        const formatted = d.display ?? valueFormat(d.value)
        return (
          <li
            key={i}
            title={`${d.label} · ${formatted}`}
            className="flex items-center gap-2 text-sm"
          >
            <span className="w-24 shrink-0 truncate text-muted-foreground">{d.label}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${pct(d.value)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{formatted}</span>
          </li>
        )
      })}
    </ul>
  )
}
