import { Megaphone, Users, Image as ImageIcon, Lightbulb } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Badge } from '@/components/ui/badge'
import { PageTabs } from '@/components/page-tabs'
import type { BadgeTone } from '@/lib/status-badge'
import { MarketingFrame } from '../_components/marketing-frame'
import { Composer } from './composer'
import { PollResults } from './results'
import { POLL_SURFACES, SURFACE_LABELS, type PollSurface } from './shared'

export const dynamic = 'force-dynamic'

const SONDAGES_TABS = ['nouveau', 'historique'] as const
type SondagesTab = (typeof SONDAGES_TABS)[number]

function parseTab(raw: string | undefined): SondagesTab {
  return (SONDAGES_TABS as readonly string[]).includes(raw ?? '') ? (raw as SondagesTab) : 'nouveau'
}

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

export default async function SondagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = parseTab(tabParam)

  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <MarketingFrame title="Sondages">
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground">
          Aucun restaurant associé à votre compte pour le moment.
        </div>
      </MarketingFrame>
    )
  }
  const restaurantId = member.restaurant_id

  const pro = await isPro(supabase, restaurantId)
  if (!pro) {
    return (
      <MarketingFrame title="Sondages">
        <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </div>
      </MarketingFrame>
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
    <MarketingFrame
      title="Sondages"
      description="Créez des sondages WhatsApp et suivez leurs résultats."
    >
      {/* Sous-onglets de la page (pills), distincts de la nav de section
          `MarketingTabs` (soulignée) affichée juste au-dessus par le layout. */}
      <PageTabs
        tabs={[
          { value: 'nouveau', label: 'Nouveau sondage' },
          { value: 'historique', label: 'Historique' },
        ]}
        active={tab}
        variant="pills"
      />

      {tab === 'nouveau' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Composer restaurantId={restaurantId} hasChannel={!!resto?.wa_channel_id} />
          </div>
          <aside className="lg:col-span-1">
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-4">
              <div>
                <h2 className="font-display text-base font-semibold">Comment ça marche</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choisissez où diffuser votre sondage — vous pouvez combiner plusieurs surfaces.
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Megaphone className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{SURFACE_LABELS.channel}</p>
                    <p className="text-xs text-muted-foreground">
                      Publie le sondage sur votre chaîne — les abonnés votent directement.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Users className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{SURFACE_LABELS.group}</p>
                    <p className="text-xs text-muted-foreground">
                      Envoie le sondage dans votre groupe interne pour consulter l’équipe.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <ImageIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{SURFACE_LABELS.status_teaser}</p>
                    <p className="text-xs text-muted-foreground">
                      Une annonce en statut qui renvoie vers le vote sur la chaîne.
                    </p>
                  </div>
                </li>
              </ul>

              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lightbulb className="size-4 text-primary" />
                  Bonnes pratiques
                </p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
                  <li>Une question courte et claire.</li>
                  <li>Entre 2 et 4 options pour un vote lisible.</li>
                  <li>Activez le quiz pour révéler la bonne réponse.</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'historique' &&
        (rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun sondage pour l’instant.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => {
              const badge = statusBadge(p.status, p.sent_count)
              const surfaces = resolveSurfaces(p)
              const surfaceStatus = p.surface_status ?? {}
              return (
                <li key={p.id} className="h-full">
                  <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
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
                    <div className="mt-auto pt-2">
                      <PollResults pollId={p.id} surfaces={surfaces} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ))}
    </MarketingFrame>
  )
}
