import Link from 'next/link'
import { ArrowRight, BarChart3, Image as ImageIcon, Megaphone, QrCode, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { MarketingKpis } from './hub-data'

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl border-none bg-muted/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold">{value}</p>
    </Card>
  )
}

function ToolCard({
  href,
  icon: Icon,
  tint,
  title,
  description,
  metric,
}: {
  href: string
  icon: LucideIcon
  tint: string
  title: string
  description: string
  metric: string
}) {
  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col gap-3 rounded-2xl p-5 transition-colors hover:border-primary/40">
        <div className="flex items-center gap-3">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
            <Icon className="size-5 text-foreground/80" />
          </span>
          <span className="font-display text-lg font-semibold">{title}</span>
          <ArrowRight className="ml-auto size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <span className="mt-auto w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {metric}
        </span>
      </Card>
    </Link>
  )
}

export function MarketingHub({ kpis }: { kpis: MarketingKpis }) {
  const subscribers = kpis.subscribers === null ? '—' : String(kpis.subscribers)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tout ce qui touche vos clients sur WhatsApp, au même endroit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Abonnés chaîne" value={subscribers} />
        <Kpi label="Opt-ins collectés" value={String(kpis.optIns)} />
        <Kpi label="Statuts ce mois" value={String(kpis.statusesThisMonth)} />
        <Kpi label="Sondages actifs" value={String(kpis.activePolls)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ToolCard
          href="/app/marketing/statuts"
          icon={ImageIcon}
          tint="bg-tint-peach"
          title="Statuts WhatsApp"
          description="Publiez des stories de vos plats, en manuel ou en automatique."
          metric={`${kpis.statusesThisMonth} publié${kpis.statusesThisMonth > 1 ? 's' : ''} ce mois`}
        />
        <ToolCard
          href="/app/marketing/chaine"
          icon={Megaphone}
          tint="bg-tint-mint"
          title="Chaîne WhatsApp"
          description="Diffusez vos offres à tous vos abonnés en un seul post."
          metric={kpis.subscribers === null ? 'Canal à connecter' : `${kpis.subscribers} abonné${kpis.subscribers > 1 ? 's' : ''}`}
        />
        <ToolCard
          href="/app/marketing/sondages"
          icon={BarChart3}
          tint="bg-tint-sky"
          title="Sondages"
          description="Posez une question à vos clients, ils votent en un tap."
          metric={`${kpis.activePolls} actif${kpis.activePolls > 1 ? 's' : ''}`}
        />
        <ToolCard
          href="/app/marketing/qr"
          icon={QrCode}
          tint="bg-tint-rose"
          title="QR opt-in"
          description="Des QR codes à coller en salle pour collecter des contacts."
          metric={`${kpis.optIns} opt-in${kpis.optIns > 1 ? 's' : ''}`}
        />
      </div>
    </div>
  )
}
