import { createSupabaseServer } from '@/lib/supabase/server'
import { buildWaLink } from '@/lib/lp/wa'
import { qrSvg } from '@/lib/qr'
import { Card } from '@/components/ui/card'
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
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }
  const restaurantId = member.restaurant_id

  const { data: channel } = await supabase.from('whapi_channels').select('phone').eq('restaurant_id', restaurantId).maybeSingle()

  if (!channel?.phone) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 font-display text-2xl font-semibold">QR opt-in</h1>
        <Card className="rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connectez d’abord votre canal WhatsApp pour générer vos QR codes.
          </p>
        </Card>
      </div>
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
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 font-display text-2xl font-semibold">QR opt-in</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Un QR par mot-clé : le client scanne, WhatsApp s’ouvre avec le message pré-rempli, il l’envoie et le bot répond aussitôt.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <QrCard key={c.keyword} keyword={c.keyword} description={c.description} link={c.link} svg={c.svg} count={c.count} />
        ))}
      </div>
    </div>
  )
}
