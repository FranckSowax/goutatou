'use client'

import { distributeSegments, segmentPath, type WheelSeg } from '@/lib/wheel-geometry'

// Même palette que la page publique (apps/web/src/app/roue/[restaurantId]/page.tsx)
// pour que la prévisualisation admin corresponde exactement à ce que verra le client.
const PRIZE_COLORS = ['#059669', '#0d9488', '#0e7490', '#65a30d', '#0891b2', '#16a34a']
const LOSE_COLOR = '#64748b'
const RETRY_COLOR = '#d97706'

const OUTER_RADIUS = 190
const INNER_RADIUS = 60
const CENTER = 200

/** Découpe un libellé de lot en au plus 2 lignes pour tenir dans un secteur étroit
 *  (même heuristique que wheel-svg.tsx de la page publique). */
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

export interface WheelPreviewPrize {
  id: string
  label: string
  imageUrl?: string | null
}

/**
 * Roue immobile construite à partir des lots + poids courants — donne au restaurateur
 * un aperçu fidèle de ce que verra le client sur `/roue/[restaurantId]`. Props = données
 * uniquement (aucune fonction), la géométrie vient de `wheel-geometry.ts` (RQ1).
 */
export function WheelPreview({
  prizes,
  unluckyWeight,
  retryWeight,
}: {
  prizes: WheelPreviewPrize[]
  unluckyWeight: number
  retryWeight: number
}) {
  const segments: WheelSeg[] = [
    ...prizes.map(
      (p, i): WheelSeg => ({
        key: p.id,
        label: p.label,
        kind: 'prize',
        color: PRIZE_COLORS[i % PRIZE_COLORS.length],
        imageUrl: p.imageUrl,
      }),
    ),
    ...(unluckyWeight > 0 ? [{ key: 'lose', label: 'Pas de chance', kind: 'lose', color: LOSE_COLOR } as WheelSeg] : []),
    ...(retryWeight > 0 ? [{ key: 'retry', label: 'Rejouez !', kind: 'retry', color: RETRY_COLOR } as WheelSeg] : []),
  ]

  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">Ajoutez au moins un lot actif pour prévisualiser la roue.</p>
  }

  const distributed = distributeSegments(segments)
  const total = distributed.length

  return (
    <div className="mx-auto w-[260px] max-w-full">
      <svg viewBox="0 0 400 400" className="w-full">
        <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 4} fill="none" stroke="var(--warning)" strokeWidth={4} />
        {distributed.map((seg, i) => {
          const pos = textPosition(i, total)
          const lines = splitLabel(seg.label)
          return (
            <g key={seg.key}>
              <path d={segmentPath(i, total, OUTER_RADIUS, INNER_RADIUS)} fill={seg.color} stroke="var(--card)" strokeWidth={1.5} />
              {seg.imageUrl ? (
                <g transform={`rotate(${pos.rotation + 90}, ${pos.x}, ${pos.y})`}>
                  <image href={seg.imageUrl} x={pos.x - 18} y={pos.y - 18} width={36} height={36} clipPath="circle(18px)" />
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
      <p className="mt-2 text-center text-xs text-muted-foreground">Aperçu immobile — la roue tourne réellement sur la page publique.</p>
    </div>
  )
}
