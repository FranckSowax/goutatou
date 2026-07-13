'use client'
import { useState } from 'react'
import { HBarList } from '@/components/charts/HBarList'
// Server Action importée directement (jamais de prop fonction Server→Client, cf. Global
// Constraints du plan sondages-v2) : `PollResults` est monté depuis page.tsx (server component)
// sans lui passer de callback, il appelle `getPollResults` lui-même.
import { getPollResults, type PollResultsPayload, type PollSurfaceResult } from './actions'
import { POLL_SURFACES, SURFACE_LABELS, type PollSurface } from './shared'

function isError(r: PollSurfaceResult): r is { error: string } {
  return 'error' in r
}

/** Résultats d'une surface votable (chaîne/groupe) — `loaded` distingue « pas encore chargé »
 * (avant le premier appel) de « chargé mais aucun id de message » (surface pas encore envoyée ou
 * échouée, cf. Global Constraints : « gérer proprement un poll dont les message ids sont nuls »). */
function SurfaceBlock({
  label,
  result,
  loaded,
}: {
  label: string
  result: PollSurfaceResult | undefined
  loaded: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      {!loaded ? null : !result ? (
        <p className="text-sm text-muted-foreground">Pas encore de résultats.</p>
      ) : isError(result) ? (
        <p className="text-sm text-destructive">{result.error}</p>
      ) : result.total === 0 ? (
        <p className="text-sm text-muted-foreground">Pas encore de votes.</p>
      ) : (
        <>
          <HBarList
            ariaLabel={`Résultats — ${label}`}
            data={result.options.map((o) => ({ label: o.label || '—', value: o.count }))}
          />
          <p className="text-xs text-muted-foreground">
            {result.total} vote{result.total > 1 ? 's' : ''} au total
          </p>
        </>
      )}
    </div>
  )
}

export function PollResults({ pollId, surfaces }: { pollId: string; surfaces: PollSurface[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PollResultsPayload | null>(null)

  const orderedSurfaces = POLL_SURFACES.filter((s) => surfaces.includes(s))
  if (orderedSurfaces.length === 0) return null

  async function onShow() {
    setOpen(true)
    if (results || loading) return
    setLoading(true)
    setError(null)
    try {
      const payload = await getPollResults(pollId)
      setResults(payload)
    } catch {
      setError('Impossible de charger les résultats. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      {!open && (
        <button
          type="button"
          onClick={onShow}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Voir les résultats
        </button>
      )}
      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading &&
            !error &&
            orderedSurfaces.map((surface) =>
              surface === 'status_teaser' ? (
                // Le status_teaser est une annonce (statut texte/image), jamais un vote natif —
                // aucun décompte à afficher pour cette surface (cf. Global Constraints).
                <div key={surface} className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">{SURFACE_LABELS.status_teaser}</p>
                  <p className="text-sm text-muted-foreground">Annonce publiée</p>
                </div>
              ) : (
                <SurfaceBlock
                  key={surface}
                  label={SURFACE_LABELS[surface]}
                  result={results?.[surface]}
                  loaded={results !== null}
                />
              ),
            )}
        </div>
      )}
    </div>
  )
}
