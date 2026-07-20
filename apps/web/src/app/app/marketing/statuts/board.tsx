'use client'
import { useMemo, useState } from 'react'
import { statusStateLabel } from '@goutatou/db/types'
import type { StatusState } from '@goutatou/db/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { badgeVariantForStatus } from '@/lib/status-badge'
import { useTableRefresh } from '@/lib/use-table-refresh'
import { cancelStatus } from './actions'
import { StatusPreview } from './status-preview'
import { fontStyleFor, filterStatusesByState, paginate, STATUS_FILTER_OPTIONS } from './shared'
import type { StatusCardKind, StatusAudience, StatusFilterState } from './shared'

interface Row {
  id: string
  kind: StatusCardKind
  content: string
  media_url: string | null
  bg_color: string | null
  caption_color: string | null
  font_type: number | null
  audience: StatusAudience
  state: StatusState
  scheduled_at: string | null
  created_at: string
}

const KIND_LABEL: Record<StatusCardKind, string> = { text: 'Texte', image: 'Image', video: 'Vidéo' }

function audienceLabel(a: StatusAudience): string {
  return a === 'optin' ? 'Clients opt-in 👑' : 'Tous les clients'
}

export function Board({ initial }: { initial: Row[] }) {
  const [filter, setFilter] = useState<StatusFilterState>('all')
  const [page, setPage] = useState(1)

  useTableRefresh({ channelName: 'statuses', tables: ['statuses'] })

  const filtered = useMemo(() => filterStatusesByState(initial, filter), [initial, filter])
  const { items: pageItems, page: currentPage, pageCount } = useMemo(
    () => paginate(filtered, page),
    [filtered, page],
  )

  function onFilterChange(value: string) {
    setFilter(value as StatusFilterState)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Historique</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="statut-filter" className="sr-only">
            Filtrer par état
          </label>
          <Select value={filter} onValueChange={onFilterChange}>
            <SelectTrigger id="statut-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grille pleine largeur de cartes de statut homogènes (aperçu 9:16). */}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((s) => (
          <li key={s.id}>
            <Dialog>
              <Card className="flex flex-col gap-2 overflow-hidden rounded-2xl p-2">
                <DialogTrigger asChild>
                  <button type="button" className="flex w-full flex-col text-left">
                    <div className="relative">
                      <StatusPreview
                        className="max-w-none"
                        data={{
                          kind: s.kind,
                          content: s.content,
                          mediaUrl: s.media_url,
                          bgColor: s.bg_color ?? '#1F2C34',
                          captionColor: s.caption_color ?? '#FFFFFF',
                          fontType: s.font_type ?? 0,
                        }}
                      />
                      <Badge
                        variant={badgeVariantForStatus(s.state)}
                        className="absolute top-2 right-2 shadow-sm"
                      >
                        {statusStateLabel(s.state)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1 pt-2">
                      <span className="font-display text-sm font-semibold">{KIND_LABEL[s.kind]}</span>
                      <span className="text-xs text-muted-foreground">{audienceLabel(s.audience)}</span>
                    </div>
                    {s.scheduled_at && (
                      <p className="px-1 text-xs text-muted-foreground">
                        Programmé : {new Date(s.scheduled_at).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </button>
                </DialogTrigger>
                {(s.state === 'scheduled' || s.state === 'posting') && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mx-1 mb-1 self-start"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Annuler
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Annuler ce statut ?</DialogTitle>
                        <DialogDescription>
                          Ce statut ne sera pas publié sur WhatsApp. Cette action est irréversible.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            Retour
                          </Button>
                        </DialogClose>
                        <form action={cancelStatus.bind(null, s.id)}>
                          <Button type="submit" variant="destructive">
                            Annuler le statut
                          </Button>
                        </form>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </Card>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Aperçu du statut</DialogTitle>
                  <DialogDescription>
                    {statusStateLabel(s.state)} · {audienceLabel(s.audience)}
                    {s.kind === 'text' && ` · Police ${fontStyleFor(s.font_type ?? 0).label}`}
                  </DialogDescription>
                </DialogHeader>
                <StatusPreview
                  className="max-w-xs"
                  data={{
                    kind: s.kind,
                    content: s.content,
                    mediaUrl: s.media_url,
                    bgColor: s.bg_color ?? '#1F2C34',
                    captionColor: s.caption_color ?? '#FFFFFF',
                    fontType: s.font_type ?? 0,
                  }}
                />
              </DialogContent>
            </Dialog>
          </li>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-muted-foreground">
            {initial.length === 0
              ? 'Aucun statut pour l’instant — créez-en un depuis l’onglet « Nouveau statut ».'
              : 'Aucun statut pour ce filtre.'}
          </p>
        )}
      </ul>

      {filtered.length > 0 && pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  )
}
