import { scaleLinear, sparseTicks } from './geometry'

export interface BarChartPoint {
  label: string
  value: number
}

export interface BarChartProps {
  data: BarChartPoint[]
  height?: number
  valueFormat?: (n: number) => string
  ariaLabel: string
}

const W = 640
const PAD_BOTTOM = 18
const PAD_TOP = 8
const GRID_LINES = 3
const MAX_TICKS = 8
const GAP = 2

const defaultFormat = (n: number) => String(n)

/**
 * Chart de barres verticales, server component, zéro JS client. Barres fines, coins arrondis
 * en haut (rx=4 — toléré aussi en bas, un simple `rect rx=4` arrondit les 4 coins ; on ne clip
 * pas la base pour rester simple), baseline en bas.
 */
export function BarChart({ data, height = 160, valueFormat = defaultFormat, ariaLabel }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <p role="img" aria-label={ariaLabel} className="text-sm text-muted-foreground">
        Pas de données
      </p>
    )
  }

  const chartH = height - PAD_TOP - PAD_BOTTOM
  const n = data.length
  const values = data.map((d) => d.value)
  const max = Math.max(...values, 0)
  const y = scaleLinear(max, chartH)

  const barW = Math.max((W - GAP * (n - 1)) / n, 1)
  const xFor = (i: number) => i * (barW + GAP)
  const ticks = sparseTicks(data, MAX_TICKS)

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${height}`}
      className="w-full h-auto"
    >
      <g transform={`translate(0, ${PAD_TOP})`}>
        {/* grille horizontale */}
        <g className="stroke-border" strokeWidth={1}>
          {Array.from({ length: GRID_LINES }, (_, i) => {
            const gy = (chartH / (GRID_LINES - 1)) * i
            return <line key={i} x1={0} y1={gy} x2={W} y2={gy} />
          })}
        </g>

        {/* barres */}
        <g className="fill-primary">
          {data.map((d, i) => {
            const barH = y(d.value)
            return (
              <rect key={i} x={xFor(i)} y={chartH - barH} width={barW} height={Math.max(barH, 0.5)} rx={4}>
                <title>
                  {d.label} · {valueFormat(d.value)}
                </title>
              </rect>
            )
          })}
        </g>
      </g>

      {/* labels d'axe x */}
      <g className="fill-muted-foreground text-[10px]">
        {ticks.map(({ item, index }) => {
          const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'
          return (
            <text key={index} x={xFor(index) + barW / 2} y={height - 4} textAnchor={anchor}>
              {item.label}
            </text>
          )
        })}
      </g>
    </svg>
  )
}
