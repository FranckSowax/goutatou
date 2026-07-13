import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { qrSvg } from '@/lib/qr'
import { Card } from '@/components/ui/card'
import { CreateChannelCard } from './create-channel-card'
import { InviteCard } from './invite-card'
import { Composer } from './composer'
import { History } from './history'
import { loadChannelHistory, loadChannelSubscribers } from './channel-data'

export const dynamic = 'force-dynamic'

export default async function ChaineWhatsAppPage() {
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
    .select('name, wa_channel_id, wa_channel_invite')
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
  const [subscribers, history] = await Promise.all([
    loadChannelSubscribers(supabase, restaurantId, resto.wa_channel_id),
    loadChannelHistory(supabase, restaurantId, resto.wa_channel_id),
  ])

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {resto.name}
        {subscribers !== null && ` · ${subscribers} abonné${subscribers > 1 ? 's' : ''}`}
      </p>
      <div className="flex flex-col gap-6">
        <InviteCard invite={resto.wa_channel_invite} svg={svg} />
        <Composer restaurantId={restaurantId} />
        <History entries={history} />
      </div>
    </div>
  )
}
