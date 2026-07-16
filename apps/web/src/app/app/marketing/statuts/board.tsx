'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
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
  const router = useRouter()
  const [filter, setFilter] = useState<StatusFilterState>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel('statuses').on('postgres_changes',
      { event: '*', schema: 'public', table: 'statuses' }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [router])

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

      {/* Grille sur les grands écrans : la largeur sert à montrer plus d'entrées à la
          fois, pas à étirer chaque carte. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((s) => (
          <li key={s.id}>
            <Dialog>
              <Card className="rounded-2xl p-4">
                <DialogTrigger asChild>
                  <button type="button" className="flex w-full flex-col text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold">{KIND_LABEL[s.kind]}</span>
                      <Badge variant={badgeVariantForStatus(s.state)}>{statusStateLabel(s.state)}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{audienceLabel(s.audience)}</p>
                    {s.media_url && s.kind === 'image' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.media_url} alt="" className="mt-2 max-h-40 rounded-lg object-cover" />
                    )}
                    {s.scheduled_at && (
                      <p className="mt-2 text-sm text-muted-foreground">Programmé : {new Date(s.scheduled_at).toLocaleString('fr-FR')}</p>
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
                        className="mt-2 self-start"
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
          <p className="text-muted-foreground sm:col-span-2 xl:col-span-3">
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
