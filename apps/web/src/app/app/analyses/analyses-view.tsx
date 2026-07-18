import Link from 'next/link'
import { formatFcfa } from '@goutatou/db/types'
import { pctDelta } from '@/lib/stats'
import { cn } from '@/lib/utils'
import {
  isInsightsEmpty,
  type AiInsights,
  type AiReport,
  type AnalysisKpis,
  type AnalysisPeriod,
} from './analyses-data'

const PERIODS: { key: AnalysisPeriod; label: string }[] = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
]

const PERIOD_ADJECTIVE: Record<AnalysisPeriod, string> = {
  day: 'quotidien',
  week: 'hebdomadaire',
  month: 'mensuel',
}

/** Pastille Δ% : ▲ vert si favorable, ▼ rouge si défavorable, — discret si base nulle. */
function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const delta = pctDelta(current, previous)
  if (delta === null) {
    return <span className="text-xs font-medium text-muted-foreground">— vs période précédente</span>
  }
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
  const sign = delta > 0 ? '+' : ''
  const isGood = delta === 0 ? null : invert ? delta < 0 : delta > 0
  const color = isGood === null ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive'
  return (
    <span className={cn('text-xs font-semibold', color)}>
      {arrow} {sign}
      {delta} % <span className="font-normal text-muted-foreground">vs période précédente</span>
    </span>
  )
}

function KpiTile({
  label,
  value,
  current,
  previous,
  invert = false,
}: {
  label: string
  value: string
  current: number
  previous: number
  invert?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <Delta current={current} previous={previous} invert={invert} />
    </div>
  )
}

/** Mini-répartition en lignes (label + compteur), barre proportionnelle discrète. */
function SplitCard({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{r.label}</span>
              <span className="font-semibold text-muted-foreground">{r.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Carte IA générique : titre + liste de puces (n'affiche rien si la liste est vide). */
function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

function AiBlock({ ai, period }: { ai: AiInsights; period: AnalysisPeriod }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-semibold">Analyse IA</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          rapport {PERIOD_ADJECTIVE[period]}
        </span>
      </div>

      {/* Résumé exécutif mis en avant */}
      <section className="rounded-2xl border border-primary/30 bg-accent p-6">
        <h3 className="font-display text-base font-semibold text-primary">Résumé exécutif</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {ai.resume_executif.trim() || 'Pas encore de résumé pour cette période.'}
        </p>
      </section>

      {/* 3 actions marketing bien visibles */}
      {ai.actions_marketing.length > 0 && (
        <section className="rounded-2xl border border-primary/30 bg-card p-6 shadow-xs">
          <h3 className="font-display text-base font-semibold">Actions marketing recommandées</h3>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {ai.actions_marketing.slice(0, 3).map((action, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-xl bg-accent p-4">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground">{action}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard title="Demandes & attentes" items={ai.demandes} empty="Aucune demande marquante." />
        <ListCard title="Plats préférés" items={ai.plats_preferes} empty="Pas de tendance nette." />
        <ListCard
          title="Demandes non satisfaites"
          items={ai.demandes_non_satisfaites}
          empty="Rien à signaler."
        />

        {/* Sentiment & frictions */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h3 className="font-display text-base font-semibold">Sentiment & frictions</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-primary">{ai.sentiment.note}/5</span>
            <span className="text-sm text-muted-foreground">note de satisfaction</span>
          </div>
          {ai.sentiment.resume.trim() && (
            <p className="text-sm text-foreground">{ai.sentiment.resume}</p>
          )}
          {ai.frictions.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {ai.frictions.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune friction identifiée.</p>
          )}
        </section>
      </div>

      {/* FAQ */}
      {ai.faq.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h3 className="font-display text-base font-semibold">Questions fréquentes & réponses suggérées</h3>
          <ul className="flex flex-col divide-y divide-border">
            {ai.faq.map((f, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-foreground">{f.question}</p>
                <p className="text-sm text-muted-foreground">{f.reponse_suggeree}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function AnalysesView({
  kpis,
  previous,
  aiReport,
  period,
}: {
  kpis: AnalysisKpis
  previous: AnalysisKpis
  aiReport: AiReport | null
  period: AnalysisPeriod
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Analyses</h1>
        <nav className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-xs">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`?period=${p.key}`}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                p.key === period
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Bloc KPIs déterministes */}
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Indicateurs de la période</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Commandes" value={String(kpis.orders)} current={kpis.orders} previous={previous.orders} />
          <KpiTile label="Chiffre d'affaires" value={formatFcfa(kpis.revenue)} current={kpis.revenue} previous={previous.revenue} />
          <KpiTile label="Panier moyen" value={formatFcfa(kpis.avgBasket)} current={kpis.avgBasket} previous={previous.avgBasket} />
          <KpiTile label="Taux de conversion" value={`${kpis.conversionRate} %`} current={kpis.conversionRate} previous={previous.conversionRate} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Conversations" value={String(kpis.chats)} current={kpis.chats} previous={previous.chats} />
          <KpiTile label="Messages reçus" value={String(kpis.messagesIn)} current={kpis.messagesIn} previous={previous.messagesIn} />
          <KpiTile label="Nouveaux clients" value={String(kpis.newCustomers)} current={kpis.newCustomers} previous={previous.newCustomers} />
          <KpiTile label="Taux d'annulation" value={`${kpis.cancelRate} %`} current={kpis.cancelRate} previous={previous.cancelRate} invert />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SplitCard title="Répartition par mode" rows={kpis.modeSplit.map((m) => ({ label: m.label, count: m.count }))} />
          <SplitCard title="Répartition par source" rows={kpis.sourceSplit.map((s) => ({ label: s.label, count: s.count }))} />
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
            <h3 className="font-display text-base font-semibold">Top plats</h3>
            {kpis.topItems.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {kpis.topItems.map((it, i) => (
                  <li key={it.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">
                      <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                      {it.name}
                    </span>
                    <span className="shrink-0 font-semibold text-muted-foreground">{it.qty} ×</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>
            )}
          </section>
        </div>
      </div>

      {/* Bloc IA */}
      {aiReport && !isInsightsEmpty(aiReport.ai_insights) ? (
        <AiBlock ai={aiReport.ai_insights} period={period} />
      ) : (
        <div className="rounded-2xl border border-border bg-accent p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-foreground">Analyse IA en préparation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le prochain rapport {PERIOD_ADJECTIVE[period]} sera généré automatiquement.
          </p>
        </div>
      )}
    </div>
  )
}
