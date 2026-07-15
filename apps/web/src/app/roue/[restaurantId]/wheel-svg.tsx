'use client'

import { segmentPath, type WheelSeg } from '@/lib/wheel-geometry'

const OUTER_RADIUS = 190
const INNER_RADIUS = 60
const CENTER = 200

/** Découpe un libellé de lot en au plus 2 lignes pour tenir dans un secteur étroit. */
function splitLabel(text: string): string[] {
  if (text.length <= 10) return [text]
  const mid = Math.ceil(text.length / 2)
  let cut = text.indexOf(' ', mid - 3)
  if (cut === -1 || cut > mid + 4) cut = text.lastIndexOf(' ', mid)
  if (cut === -1 || cut < 3) return [text.slice(0, mid), text.slice(mid)]
  return [text.slice(0, cut), text.slice(cut + 1)]
}

function textPosition(index: number, total: number) {
  const segmentAngle = 360 / total
  const midAngle = ((index * segmentAngle + segmentAngle / 2 - 90) * Math.PI) / 180
  const radius = 130
  return {
    x: CENTER + radius * Math.cos(midAngle),
    y: CENTER + radius * Math.sin(midAngle),
    rotation: index * segmentAngle + segmentAngle / 2 - 90,
  }
}

const LED_COUNT = 20
const ledLights = Array.from({ length: LED_COUNT }, (_, i) => {
  const angle = (i * (360 / LED_COUNT) - 90) * (Math.PI / 180)
  return {
    x: CENTER + 198 * Math.cos(angle),
    y: CENTER + 198 * Math.sin(angle),
    on: i % 2 === 0,
  }
})

export function WheelSvg({
  segments,
  rotation,
  spinning,
}: {
  segments: WheelSeg[]
  rotation: number
  spinning: boolean
}) {
  const total = segments.length || 1

  return (
    <div className="relative h-[80vw] max-h-[340px] w-[80vw] max-w-[340px] sm:h-[380px] sm:w-[380px]">
      {/* Anneau de LED décoratif — fixe, ne tourne pas avec la roue. */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {ledLights.map((led, i) => (
          <circle
            key={i}
            cx={led.x}
            cy={led.y}
            r={4}
            fill={led.on ? 'var(--warning)' : 'var(--muted)'}
            className={led.on ? 'animate-pulse' : ''}
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </svg>

      {/* Pointeur fixe en haut. */}
      <svg viewBox="0 0 40 48" className="absolute -top-2 left-1/2 z-20 h-10 w-8 -translate-x-1/2 drop-shadow" aria-hidden="true">
        <path d="M20 48 L4 6 Q20 0 36 6 Z" fill="var(--warning)" stroke="var(--warning-foreground)" strokeWidth="1.5" />
      </svg>

      {/* Roue rotative. */}
      <svg
        viewBox="0 0 400 400"
        className="relative h-full w-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 5.2s cubic-bezier(0.1, 0.6, 0.15, 1)' : 'none',
        }}
      >
        <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 4} fill="none" stroke="var(--warning)" strokeWidth={4} />

        {segments.map((seg, i) => {
          const pos = textPosition(i, total)
          const lines = splitLabel(seg.label)
          return (
            <g key={seg.key}>
              <path d={segmentPath(i, total, OUTER_RADIUS, INNER_RADIUS)} fill={seg.color} stroke="var(--card)" strokeWidth={1.5} />
              {seg.imageUrl ? (
                <g transform={`rotate(${pos.rotation + 90}, ${pos.x}, ${pos.y})`}>
                  <image
                    href={seg.imageUrl}
                    x={pos.x - 18}
                    y={pos.y - 18}
                    width={36}
                    height={36}
                    clipPath="circle(18px)"
                  />
                </g>
              ) : (
                <g transform={`rotate(${pos.rotation + 90}, ${pos.x}, ${pos.y})`}>
                  {lines.map((line, li) => (
                    <text
                      key={li}
                      x={pos.x}
                      y={pos.y + (li - (lines.length - 1) / 2) * 16}
                      fill="#ffffff"
                      fontSize={14}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              )}
            </g>
          )
        })}

        <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 4} fill="var(--warning)" />
        <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 12} fill="var(--card)" />
      </svg>
    </div>
  )
}
