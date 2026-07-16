import { createSupabaseServer } from '@/lib/supabase/server'
import { isPremium, isPro } from '@/lib/premium'
import { qrSvg } from '@/lib/qr'
import { Card } from '@/components/ui/card'
import { PageTabs } from '@/components/page-tabs'
import { CreateChannelCard } from './create-channel-card'
import { InviteCard } from './invite-card'
import { Composer } from './composer'
import { History } from './history'
import { ScheduledList } from './scheduled-list'
import { AutoChannelCard } from './auto-channel-card'
import {
  loadAutoChannelSettings,
  loadChannelHistory,
  loadChannelSubscribers,
  loadScheduledPosts,
} from './channel-data'

export const dynamic = 'force-dynamic'

const CHAINE_TABS = ['publier', 'auto', 'programmes', 'historique', 'invitation'] as const
type ChaineTab = (typeof CHAINE_TABS)[number]

function parseTab(raw: string | undefined): ChaineTab {
  return (CHAINE_TABS as readonly string[]).includes(raw ?? '') ? (raw as ChaineTab) : 'publier'
}

export default async function ChaineWhatsAppPage({
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
        <h1 className="mb-6 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
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
    .select('name, wa_channel_id, wa_channel_invite, contact_phone')
    .eq('id', restaurantId)
    .single()
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (!resto) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Restaurant introuvable.
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
        <Card className="rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Connectez d’abord votre canal WhatsApp.</p>
        </Card>
      </div>
    )
  }

  if (!resto.wa_channel_id) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
        <CreateChannelCard restaurantName={resto.name} />
      </div>
    )
  }

  const svg = resto.wa_channel_invite ? await qrSvg(resto.wa_channel_invite) : null
  const premium = await isPremium(supabase, restaurantId)
  const [subscribers, history, scheduledPosts, autoChannelSettings] = await Promise.all([
    loadChannelSubscribers(supabase, restaurantId, resto.wa_channel_id),
    loadChannelHistory(supabase, restaurantId, resto.wa_channel_id),
    loadScheduledPosts(supabase, restaurantId),
    premium ? loadAutoChannelSettings(supabase, restaurantId) : Promise.resolve(null),
  ])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="mb-1 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          {resto.name}
          {subscribers !== null && ` · ${subscribers} abonné${subscribers > 1 ? 's' : ''}`}
        </p>
      </div>

      <PageTabs
        tabs={[
          { value: 'publier', label: 'Publier' },
          { value: 'auto', label: 'Auto 👑' },
          { value: 'programmes', label: 'Programmés' },
          { value: 'historique', label: 'Historique' },
          { value: 'invitation', label: 'Invitation' },
        ]}
        active={tab}
        variant="pills"
      />

      {tab === 'publier' && (
        <div className="max-w-2xl">
          <Composer restaurantId={restaurantId} contactPhone={resto.contact_phone ?? null} />
        </div>
      )}

      {tab === 'auto' && (
        <div className="max-w-2xl">
          {premium && autoChannelSettings ? (
            <AutoChannelCard
              enabled={autoChannelSettings.enabled}
              times={autoChannelSettings.times}
              count={autoChannelSettings.count}
              validationMode={autoChannelSettings.validationMode}
            />
          ) : (
            <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
              <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Premium</p>
              <p className="mt-2 text-sm text-muted-foreground">
                La publication automatique sur la chaîne est réservée au plan <strong>Premium</strong>. Contactez
                Goutatou pour l’activer.
              </p>
            </Card>
          )}
        </div>
      )}

      {tab === 'programmes' && <ScheduledList posts={scheduledPosts} />}

      {tab === 'historique' && <History entries={history} />}

      {tab === 'invitation' && (
        <div className="max-w-sm">
          <InviteCard invite={resto.wa_channel_invite} svg={svg} />
        </div>
      )}
    </div>
  )
}
