import { createSupabaseServer } from '@/lib/supabase/server'
import { isPremium, isPro } from '@/lib/premium'
import { qrSvg } from '@/lib/qr'
import { PageTabs } from '@/components/page-tabs'
import { MarketingFrame } from '../_components/marketing-frame'
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
      <MarketingFrame title="Chaîne WhatsApp">
        <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
          Aucun restaurant associé à votre compte pour le moment.
        </div>
      </MarketingFrame>
    )
  }
  const restaurantId = member.restaurant_id

  const pro = await isPro(supabase, restaurantId)
  if (!pro) {
    return (
      <MarketingFrame title="Chaîne WhatsApp">
        <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-lg font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </div>
      </MarketingFrame>
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
      <MarketingFrame title="Chaîne WhatsApp">
        <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
          Restaurant introuvable.
        </div>
      </MarketingFrame>
    )
  }

  if (!channel) {
    return (
      <MarketingFrame title="Chaîne WhatsApp">
        <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
          Connectez d’abord votre canal WhatsApp.
        </div>
      </MarketingFrame>
    )
  }

  if (!resto.wa_channel_id) {
    return (
      <MarketingFrame title="Chaîne WhatsApp">
        <div className="max-w-xl">
          <CreateChannelCard restaurantName={resto.name} />
        </div>
      </MarketingFrame>
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
    <MarketingFrame
      title="Chaîne WhatsApp"
      description="Diffusez vos actualités et promotions à tous vos abonnés."
      action={
        <div className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
          {resto.name}
          {subscribers !== null && ` · ${subscribers} abonné${subscribers > 1 ? 's' : ''}`}
        </div>
      }
    >
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
            <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
              <p className="font-display text-lg font-semibold text-accent-foreground">Fonctionnalité Premium</p>
              <p className="mt-2 text-sm text-muted-foreground">
                La publication automatique sur la chaîne est réservée au plan <strong>Premium</strong>. Contactez
                Goutatou pour l’activer.
              </p>
            </div>
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
    </MarketingFrame>
  )
}
