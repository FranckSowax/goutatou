import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { BadgeTone } from '@/lib/status-badge'
import { Composer } from './composer'
import { PollResults } from './results'
import { POLL_SURFACES, SURFACE_LABELS, type PollSurface } from './shared'

export const dynamic = 'force-dynamic'

type PollStatus = 'queued' | 'sending' | 'sent' | 'failed'
type PollTarget = 'channel' | 'optin'

interface PollRow {
  id: string
  question: string
  options: string[]
  quiz_correct: number | null
  target: PollTarget
  surfaces: PollSurface[] | null
  status: PollStatus
  sent_count: number
  error: string | null
  created_at: string
  sent_at: string | null
  channel_message_id: string | null
  group_message_id: string | null
  surface_status: Record<string, string> | null
}

function statusBadge(status: PollStatus, sentCount: number): { variant: BadgeTone; label: string } {
  switch (status) {
    case 'queued':
      return { variant: 'muted', label: 'En file' }
    case 'sending':
      return { variant: 'warning', label: 'Envoi…' }
    case 'sent':
      return { variant: 'success', label: `Envoyé (${sentCount})` }
    case 'failed':
      return { variant: 'destructive', label: 'Échec' }
  }
}

function targetLabel(target: PollTarget): string {
  return target === 'channel' ? 'Chaîne WhatsApp' : 'Clients opt-in'
}

/** Surfaces effectives d'un sondage ; repli sur `target` pour les lignes historiques (avant la
 * migration 0027 multi-surfaces) qui n'ont pas de `surfaces` renseignées. Réutilisé pour le
 * libellé, le détail d'envoi par surface et pour monter `<PollResults>`. */
function resolveSurfaces(p: Pick<PollRow, 'surfaces' | 'target'>): PollSurface[] {
  const surfaces = (p.surfaces ?? []).filter((s): s is PollSurface => s in SURFACE_LABELS)
  if (surfaces.length > 0) return POLL_SURFACES.filter((s) => surfaces.includes(s))
  return p.target === 'channel' ? ['channel'] : []
}

function surfacesLabel(p: Pick<PollRow, 'surfaces' | 'target'>): string {
  const surfaces = resolveSurfaces(p)
  if (surfaces.length > 0) return surfaces.map((s) => SURFACE_LABELS[s]).join(' + ')
  return targetLabel(p.target)
}

const SURFACE_SEND_LABELS: Record<string, string> = {
  sent: 'Envoyé',
  failed: 'Échec',
}

/** État d'envoi d'une surface — `surface_status` (jsonb `{ "<surface>": "sent"|"failed" }`,
 * peuplé par le poll-worker, Task SV2). Pas d'entrée pour une surface = pas encore traitée. */
function surfaceSendLabel(status: string | undefined): string {
  return status ? (SURFACE_SEND_LABELS[status] ?? status) : 'En attente'
}

export default async function SondagesPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }
  const restaurantId = member.restaurant_id

  const pro = await isPro(supabase, restaurantId)
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Sondages</h1>
        <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }

  const { data: resto } = await supabase
    .from('restaurants')
    .select('wa_channel_id')
    .eq('id', restaurantId)
    .single()

  const { data: polls } = await supabase
    .from('polls')
    .select(
      'id, question, options, quiz_correct, target, surfaces, status, sent_count, error, created_at, sent_at, channel_message_id, group_message_id, surface_status',
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (polls ?? []) as PollRow[]

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 font-display text-2xl font-semibold">Sondages</h1>
      <div className="flex flex-col gap-6">
        <Composer restaurantId={restaurantId} hasChannel={!!resto?.wa_channel_id} />
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Historique</h2>
          <ul className="flex flex-col gap-3">
            {rows.map((p) => {
              const badge = statusBadge(p.status, p.sent_count)
              const surfaces = resolveSurfaces(p)
              const surfaceStatus = p.surface_status ?? {}
              return (
                <li key={p.id}>
                  <Card className="rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 font-display font-semibold">{p.question}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {surfacesLabel(p)} · {new Date(p.created_at).toLocaleString('fr-FR')}
                    </p>
                    {surfaces.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {surfaces.map((s) => (
                          <li key={s}>
                            {SURFACE_LABELS[s]} : {surfaceSendLabel(surfaceStatus[s])}
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.status === 'failed' && p.error && (
                      <p className="mt-2 text-sm text-destructive">{p.error}</p>
                    )}
                    <PollResults pollId={p.id} surfaces={surfaces} />
                  </Card>
                </li>
              )
            })}
            {rows.length === 0 && <p className="text-muted-foreground">Aucun sondage pour l’instant.</p>}
          </ul>
        </div>
      </div>
    </div>
  )
}
