import Link from 'next/link'
import { decryptToken } from '@goutatou/db/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig } from '@/lib/lp/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { configureWebhook } from '../../actions'
import { GeneralTab } from './general-tab'
import { BotTab } from './bot-tab'
import { WheelTab } from './wheel-tab'
import { DangerTab } from './danger-tab'

export const dynamic = 'force-dynamic'

export default async function AdminRestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: resto, error } = await admin
    .from('restaurants')
    .select(
      `id, name, slug, address, contact_phone, hours_text, delivery_info, bot_welcome, bot_info_extra,
       drive_enabled, wheel_enabled, wheel_trigger_orders, lp_config, location_lat, location_lng,
       subscriptions(plan, status),
       whapi_channels(id, status, last_webhook_at, token_encrypted, phone)`
    )
    .eq('id', id)
    .single()
  if (error || !resto) throw new Error(`Restaurant introuvable : ${error?.message}`)

  const subscription = resto.subscriptions as unknown as { plan: string; status: string } | null
  const channel = resto.whapi_channels as unknown as {
    id: string
    status: string
    last_webhook_at: string | null
    token_encrypted: string
    phone: string | null
  } | null

  const lpConfig = parseLpConfig(resto.lp_config, resto.name)

  const webhookButton = channel ? (
    <form
      action={configureWebhook.bind(
        null,
        channel.id,
        decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
      )}
    >
      <Button type="submit" size="sm" variant="outline">
        Configurer le webhook
      </Button>
    </form>
  ) : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/restaurants" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Restaurants
        </Link>
        <h2 className="font-display text-lg font-semibold">{resto.name}</h2>
        <p className="text-sm text-muted-foreground">/{resto.slug}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="bot">Bot WhatsApp</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="fidelite">Fidélité</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab
            restaurant={{
              id: resto.id,
              name: resto.name,
              address: resto.address,
              contact_phone: resto.contact_phone,
              hours_text: resto.hours_text,
              delivery_info: resto.delivery_info,
              drive_enabled: resto.drive_enabled,
              location_lat: resto.location_lat,
              location_lng: resto.location_lng,
            }}
            subscription={{ plan: subscription?.plan ?? 'starter', status: subscription?.status ?? 'active' }}
          />
        </TabsContent>

        <TabsContent value="bot" className="mt-4">
          <BotTab
            restaurantId={resto.id}
            channelStatus={channel?.status}
            lastWebhookAt={channel?.last_webhook_at ?? null}
            webhookButton={webhookButton}
            hasChannel={!!channel}
            channelPhone={channel?.phone ?? null}
            botWelcome={resto.bot_welcome}
            botInfoExtra={resto.bot_info_extra}
            profile={{
              address: resto.address,
              contact_phone: resto.contact_phone,
              hours_text: resto.hours_text,
              delivery_info: resto.delivery_info,
            }}
          />
        </TabsContent>

        <TabsContent value="site" className="mt-4">
          <Card className="rounded-2xl p-4">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="font-display text-base">Landing page</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-0">
              <div className="flex items-center gap-2">
                <Badge variant={lpConfig.published ? 'success' : 'muted'}>
                  {lpConfig.published ? 'Publiée' : 'Non publiée'}
                </Badge>
                <a
                  href={'https://goutatou.netlify.app/r/' + resto.slug}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline underline-offset-4"
                >
                  /r/{resto.slug} ↗
                </a>
              </div>
              <Button asChild variant="outline" className="self-start">
                <Link href={'/admin/lp/' + resto.id}>Ouvrir l&apos;éditeur de la LP</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fidelite" className="mt-4">
          <WheelTab
            restaurantId={resto.id}
            wheelEnabled={resto.wheel_enabled}
            wheelTriggerOrders={resto.wheel_trigger_orders}
          />
        </TabsContent>

        <TabsContent value="danger" className="mt-4">
          <DangerTab restaurantId={resto.id} restaurantName={resto.name} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
