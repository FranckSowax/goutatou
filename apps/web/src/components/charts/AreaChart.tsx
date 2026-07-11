import { buildAreaPath, scaleLinear, sparseTicks } from './geometry'

export interface AreaChartPoint {
  label: string
  value: number
}

export interface AreaChartProps {
  data: AreaChartPoint[]
  height?: number
  valueFormat?: (n: number) => string
  ariaLabel: string
}

const W = 640
const PAD_BOTTOM = 18
const PAD_TOP = 8
const GRID_LINES = 3
const MAX_TICKS = 6

const defaultFormat = (n: number) => String(n)

/** Chart d'aire (ligne + remplissage), server component, zéro JS client. */
export function AreaChart({ data, height = 160, valueFormat = defaultFormat, ariaLabel }: AreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <p role="img" aria-label={ariaLabel} className="text-sm text-muted-foreground">
        Pas de données
      </p>
    )
  }

  const chartH = height - PAD_TOP - PAD_BOTTOM
  const values = data.map((d) => d.value)
  const max = Math.max(...values, 0)
  const y = scaleLinear(max, chartH)
  const n = data.length
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)

  const { line, area } = buildAreaPath(values, W, chartH)
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

        {line && n >= 2 && (
          <>
            <path d={area} className="fill-primary/15" stroke="none" />
            <path d={line} className="stroke-primary" fill="none" strokeWidth={2} />
          </>
        )}

        {/* points + tooltips natifs */}
        <g className="fill-primary">
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={chartH - y(d.value)} r={2.5}>
              <title>
                {d.label} · {valueFormat(d.value)}
              </title>
            </circle>
          ))}
        </g>
      </g>

      {/* labels d'axe x */}
      <g className="fill-muted-foreground text-[10px]">
        {ticks.map(({ item, index }) => {
          const anchor = index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'
          return (
            <text key={index} x={x(index)} y={height - 4} textAnchor={anchor}>
              {item.label}
            </text>
          )
        })}
      </g>
    </svg>
  )
}
