import { createAdminClient } from '@/lib/supabase/admin'
import { distributeSegments, type WheelSeg } from '@/lib/wheel-geometry'
import { QrWheel, type ActionOption } from './qr-wheel'

export const dynamic = 'force-dynamic'

// Palette Goutatou (émeraude/teal, cf. apps/web/src/app/globals.css --primary) pour les lots,
// afin que les segments restent lisibles et cohérents avec l'identité de la marque plutôt
// qu'une roue « arc-en-ciel » générique.
const PRIZE_COLORS = ['#059669', '#0d9488', '#0e7490', '#65a30d', '#0891b2', '#16a34a']
const LOSE_COLOR = '#64748b'
const RETRY_COLOR = '#d97706'

const ACTION_LABELS: Record<'google' | 'tiktok' | 'channel', string> = {
  google: 'Laisser un avis Google',
  tiktok: 'Suivre sur TikTok',
  channel: 'Rejoindre la chaîne WhatsApp',
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
      <p className="text-muted-foreground">Roue indisponible.</p>
    </main>
  )
}

export default async function RoueQrPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params
  const db = createAdminClient()

  const { data: resto } = await db
    .from('restaurants')
    .select(
      'name, wheel_qr_public, wheel_unlucky_weight, wheel_retry_weight, wheel_action_google, wheel_action_tiktok, wheel_action_channel, wheel_google_url, wheel_tiktok_url, wheel_channel_url, wa_channel_invite',
    )
    .eq('id', restaurantId)
    .maybeSingle()

  if (!resto || resto.wheel_qr_public !== true) {
    return <Unavailable />
  }

  const { data: prizesRaw } = await db
    .from('prizes')
    .select('id, label, image_url')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .neq('stock', 0)
    .order('position')
  const prizes = prizesRaw ?? []

  const segments: WheelSeg[] = [
    ...prizes.map((p, i): WheelSeg => ({
      key: p.id,
      label: p.label,
      kind: 'prize',
      color: PRIZE_COLORS[i % PRIZE_COLORS.length],
      imageUrl: p.image_url,
    })),
    ...((resto.wheel_unlucky_weight ?? 0) > 0
      ? [{ key: 'lose', label: 'Pas de chance', kind: 'lose', color: LOSE_COLOR } as WheelSeg]
      : []),
    ...((resto.wheel_retry_weight ?? 0) > 0
      ? [{ key: 'retry', label: 'Rejouez !', kind: 'retry', color: RETRY_COLOR } as WheelSeg]
      : []),
  ]

  if (segments.length === 0) {
    return <Unavailable />
  }

  const distributed = distributeSegments(segments)

  const channelUrl = resto.wheel_channel_url || resto.wa_channel_invite
  const actions: ActionOption[] = [
    resto.wheel_action_google && resto.wheel_google_url
      ? { key: 'google' as const, label: ACTION_LABELS.google, url: resto.wheel_google_url }
      : null,
    resto.wheel_action_tiktok && resto.wheel_tiktok_url
      ? { key: 'tiktok' as const, label: ACTION_LABELS.tiktok, url: resto.wheel_tiktok_url }
      : null,
    resto.wheel_action_channel && channelUrl
      ? { key: 'channel' as const, label: ACTION_LABELS.channel, url: channelUrl }
      : null,
  ].filter((a): a is ActionOption => a !== null)

  if (actions.length === 0) {
    return <Unavailable />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="font-display text-2xl text-foreground">🎡 {resto.name ?? 'Roue de la fortune'}</h1>
      <QrWheel restaurantId={restaurantId} segments={distributed} actions={actions} />
    </main>
  )
}
