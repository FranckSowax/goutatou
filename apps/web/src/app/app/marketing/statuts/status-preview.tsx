'use client'
import { cn } from '@/lib/utils'
import { fontStyleFor } from './shared'
import type { StatusCardKind } from './shared'

export interface StatusPreviewData {
  kind: StatusCardKind
  content: string
  mediaUrl: string | null
  bgColor: string
  captionColor: string
  fontType: number
}

/**
 * Volet 9:16 sombre imitant l'aperçu WhatsApp : texte = fond coloré plein
 * cadre + légende centrée, image = cover + légende en bas, vidéo = lecteur
 * natif (pas de légende superposée, WhatsApp n'affiche pas de style sur les
 * légendes vidéo).
 */
export function StatusPreview({ data, className }: { data: StatusPreviewData; className?: string }) {
  const font = fontStyleFor(data.fontType)
  return (
    <div
      className={cn(
        'relative mx-auto aspect-9/16 w-full max-w-56 overflow-hidden rounded-2xl bg-black ring-1 ring-foreground/10',
        className,
      )}
    >
      {data.kind === 'text' && (
        <div
          className="flex h-full w-full items-center justify-center p-6 text-center"
          style={{ backgroundColor: data.bgColor }}
        >
          <p
            className={`line-clamp-[10] whitespace-pre-wrap text-lg break-words ${font.className}`}
            style={{ color: data.captionColor }}
          >
            {data.content || 'Votre statut…'}
          </p>
        </div>
      )}

      {data.kind === 'image' && (
        <div className="relative h-full w-full bg-muted">
          {data.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
              Aucune image
            </div>
          )}
          {data.content && (
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-4 pt-10">
              <p className={`line-clamp-3 whitespace-pre-wrap text-sm text-white ${font.className}`}>
                {data.content}
              </p>
            </div>
          )}
        </div>
      )}

      {data.kind === 'video' && (
        <div className="flex h-full w-full items-center justify-center bg-black">
          {data.mediaUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video controls src={data.mediaUrl} className="h-full w-full object-contain" />
          ) : (
            <div className="text-sm text-white/50">Aucune vidéo</div>
          )}
        </div>
      )}
    </div>
  )
}
