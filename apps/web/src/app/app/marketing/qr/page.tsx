import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { buildWaLink } from '@/lib/lp/wa'
import { qrSvg } from '@/lib/qr'
import { MarketingFrame } from '../_components/marketing-frame'
import { QrCard } from './qr-card'

export const dynamic = 'force-dynamic'

const KEYWORDS = [
  {
    keyword: 'MENU',
    description: 'Le client reçoit votre menu complet et peut commander directement sur WhatsApp.',
  },
  {
    keyword: 'INFOS',
    description: 'Le client reçoit vos informations pratiques (adresse, horaires, livraison).',
  },
  {
    keyword: 'ROUE',
    description: 'Le client découvre votre programme de fidélité et sa progression vers une récompense.',
  },
  {
    keyword: 'PROMOS',
    description: 'Le client s’inscrit pour recevoir vos promotions et offres exclusives par WhatsApp.',
  },
] as const

export default async function QrOptInPage() {
  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <MarketingFrame title="QR opt-in">
        <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
          Aucun restaurant associé à votre compte pour le moment.
        </div>
      </MarketingFrame>
    )
  }
  const restaurantId = member.restaurant_id

  const { data: channel } = await supabase.from('whapi_channels').select('phone').eq('restaurant_id', restaurantId).maybeSingle()

  if (!channel?.phone) {
    return (
      <MarketingFrame title="QR opt-in">
        <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
          Connectez d’abord votre canal WhatsApp pour générer vos QR codes.
        </div>
      </MarketingFrame>
    )
  }

  const phone = channel.phone
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const cards = await Promise.all(
    KEYWORDS.map(async ({ keyword, description }) => {
      const link = buildWaLink(phone, keyword)
      const svg = await qrSvg(link)
      const { count } = await supabase
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('direction', 'in')
        .gte('created_at', since)
        .ilike('body', `%${keyword}%`)
      return { keyword, description, link, svg, count: count ?? 0 }
    })
  )

  return (
    <MarketingFrame
      title="QR opt-in"
      description="Un QR par mot-clé : le client scanne, WhatsApp s’ouvre avec le message pré-rempli, il l’envoie et le bot répond aussitôt."
    >
      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Imprimez ces QR et posez-les en salle (tables, comptoir, menu, vitrine). Chaque scan qui aboutit à un message
        vous fait gagner un opt-in : le client accepte de recevoir vos messages sur WhatsApp.
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => (
          <QrCard key={c.keyword} keyword={c.keyword} description={c.description} link={c.link} svg={c.svg} count={c.count} />
        ))}
      </div>
    </MarketingFrame>
  )
}
