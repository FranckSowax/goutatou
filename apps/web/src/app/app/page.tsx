import Link from 'next/link'
import {
  ArrowRight, CheckCircle2, Gift, LayoutTemplate, Lightbulb, MessageCircle, Sparkles, type LucideIcon,
} from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import type { OrderStatus } from '@goutatou/db'
import { createSupabaseServer } from '@/lib/supabase/server'
import { badgeVariantForOrder } from '@/lib/status-badge'
import { ORDER_STATUS_LABELS } from '@/lib/orders'
import { parseLpConfig } from '@/lib/lp/config'
import { computeHomeKpis, type HomeOrderInput } from '@/lib/home'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { KpiCard } from './home-cards'
import { HomeRefresh } from './home-refresh'

export const dynamic = 'force-dynamic'

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' })
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Africa/Libreville' })
}

function isToday(iso: string): boolean {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Africa/Libreville' }
  return new Date(iso).toLocaleDateString('fr-FR', opts) === new Date().toLocaleDateString('fr-FR', opts)
}

function jourHeure(iso: string): string {
  return isToday(iso) ? heure(iso) : `${jour(iso)} · ${heure(iso)}`
}

interface HomeOrderRow extends HomeOrderInput {
  id: string
  order_number: number
  customer_name: string | null
}

interface TodoItem {
  key: string
  icon: LucideIcon
  label: string
  href?: string
}

export default async function HomePage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: member } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .maybeSingle()

  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }

  const restaurantId = member.restaurant_id

  const [{ data: restaurant }, { data: ordersRaw }, { data: admin }] = await Promise.all([
    supabase
      .from('restaurants')
      .select('name, wheel_enabled, lp_config, subscriptions(plan), whapi_channels(status)')
      .eq('id', restaurantId)
      .single(),
    supabase
      .from('orders')
      .select('id, order_number, status, total, created_at, customers(name)')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false }),
    user
      ? supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const sub = restaurant?.subscriptions as unknown as { plan: string } | null
  const channel = restaurant?.whapi_channels as unknown as { status: string } | null
  const restaurantName = restaurant?.name ?? 'votre restaurant'
  const plan = sub?.plan ?? 'starter'
  const isAdmin = !!admin

  const orders: HomeOrderRow[] = (ordersRaw ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string | null } | null
    return {
      id: o.id as string,
      order_number: o.order_number as number,
      status: o.status as OrderStatus,
      total: o.total as number,
      created_at: o.created_at as string,
      customer_name: customer?.name ?? null,
    }
  })

  const kpis = computeHomeKpis(orders, new Date().toISOString())
  const latest = orders.slice(0, 5)
  const lp = parseLpConfig(restaurant?.lp_config, restaurantName)

  const todos: TodoItem[] = []

  if (channel?.status !== 'active') {
    todos.push(
      isAdmin
        ? { key: 'whatsapp', icon: MessageCircle, label: 'Connecter votre WhatsApp', href: '/admin' }
        : { key: 'whatsapp', icon: MessageCircle, label: 'Contactez Goutatou pour connecter votre WhatsApp' },
    )
  }
  if (!lp.published) {
    todos.push(
      isAdmin
        ? { key: 'lp', icon: LayoutTemplate, label: 'Publier votre page de commande', href: `/admin/lp/${restaurantId}` }
        : { key: 'lp', icon: LayoutTemplate, label: 'Page de commande non publiée — contactez Goutatou pour l\'activer.' },
    )
  }
  if (!restaurant?.wheel_enabled) {
    todos.push({ key: 'wheel', icon: Gift, label: 'Activer la roue de la fidélité', href: '/app/fidelite' })
  }

  return (
    <div className="flex flex-col gap-4">
      <HomeRefresh />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Colonne principale */}
        <div className="flex flex-col gap-4">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 p-8 text-primary-foreground shadow-lg">
            <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary-foreground/10" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-24 size-56 rounded-full bg-primary-foreground/5" />
            <div className="relative">
              <p className="text-sm font-medium text-primary-foreground/85">Bonjour, {restaurantName} 👋</p>
              <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-3">
                <div>
                  <p className="font-display text-4xl font-bold tracking-tight">{formatFcfa(kpis.caJour)}</p>
                  <p className="mt-1 text-sm text-primary-foreground/85">de chiffre d&apos;affaires aujourd&apos;hui</p>
                </div>
                <div>
                  <p className="font-display text-4xl font-bold tracking-tight">{kpis.enCours}</p>
                  <p className="mt-1 text-sm text-primary-foreground/85">
                    commande{kpis.enCours > 1 ? 's' : ''} active{kpis.enCours > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Button
                className="mt-6 bg-primary-foreground font-semibold text-primary shadow-md hover:bg-primary-foreground/90"
                asChild
              >
                <Link href="/app/commandes">Voir les commandes</Link>
              </Button>
            </div>
          </div>

          {/* KPIs pastel */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard tint="mint" label="CA du jour" value={formatFcfa(kpis.caJour)} />
            <KpiCard tint="peach" label="En cours" value={String(kpis.enCours)} />
            <KpiCard tint="sky" label="Prêtes" value={String(kpis.pretes)} />
            <KpiCard tint="rose" label="Panier moyen (jour)" value={formatFcfa(kpis.panierMoyen)} />
          </div>

          {/* Dernières commandes */}
          <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Dernières commandes</h2>
              <Link href="/app/commandes" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Tout voir <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {latest.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune commande pour l&apos;instant.</p>
              )}
              {latest.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">n°{o.order_number} · {o.customer_name ?? 'Client'}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{jourHeure(o.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-bold text-primary">{formatFcfa(o.total)}</span>
                    <Badge variant={badgeVariantForOrder(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Rail droit */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-2xl p-4 shadow-xs">
            <h2 className="mb-3 font-display text-lg font-semibold">À faire</h2>
            {todos.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-5 text-success" />
                Tout est en place
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {todos.map((t) => {
                  const Icon = t.icon
                  const content = (
                    <>
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{t.label}</span>
                    </>
                  )
                  return (
                    <li key={t.key}>
                      {t.href ? (
                        <Link
                          href={t.href}
                          className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="-mx-2 flex items-center gap-2.5 px-2 py-1.5">{content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {plan === 'starter' && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-accent p-3">
                <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-accent-foreground">
                  <Sparkles className="size-4" /> Passez à l&apos;offre Pro
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Débloquez la roue de la fidélité et les campagnes WhatsApp. Contactez Goutatou pour l&apos;activer.
                </p>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl p-4 shadow-xs">
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold">
              <Lightbulb className="size-4 text-warning" /> Astuce
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Répondez vite sur WhatsApp : une confirmation de commande rapide donne envie aux clients de revenir.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
