import Link from 'next/link'
import { decryptToken } from '@goutatou/db/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { configureWebhook, createRestaurant } from '../actions'
import { RestaurantRow } from './restaurant-row'
import { ActionsCell } from './actions-cell'

export const dynamic = 'force-dynamic'

type WhapiChannelStatus = 'active' | 'error' | string

function badgeVariantForChannel(status: WhapiChannelStatus | undefined) {
  if (status === 'active') return 'success' as const
  if (status === 'qr') return 'warning' as const
  if (status === 'error') return 'destructive' as const
  return 'muted' as const
}

function channelLabel(status: WhapiChannelStatus | undefined) {
  if (status === 'active') return 'Actif'
  if (status === 'qr') return 'QR à scanner'
  if (status === 'error') return 'Erreur'
  return 'Non configuré'
}

export default async function AdminRestaurantsPage() {
  const admin = createAdminClient()

  const { data: restos } = await admin
    .from('restaurants')
    .select(
      'id, slug, name, created_at, whapi_channels(id, token_encrypted, status, last_webhook_at), subscriptions(plan)'
    )
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-lg">Nouveau restaurant</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <form action={createRestaurant} className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-resto-name">Nom du restaurant</Label>
              <Input id="new-resto-name" name="name" required placeholder="Nom du restaurant" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-resto-slug">Slug</Label>
              <Input
                id="new-resto-slug"
                name="slug"
                required
                placeholder="slug (ex. chez-mama)"
                pattern="[a-z0-9-]{2,40}"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-resto-owner-email">Email du gérant</Label>
              <Input id="new-resto-owner-email" name="owner_email" required type="email" placeholder="Email du gérant" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-resto-owner-password">Mot de passe initial</Label>
              <Input id="new-resto-owner-password" name="owner_password" required placeholder="Mot de passe initial" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="new-resto-whapi-token">Token du canal Whapi</Label>
              <Input id="new-resto-whapi-token" name="whapi_token" required placeholder="Token du canal Whapi" />
            </div>
            <Button type="submit" className="sm:col-span-2">
              Créer le restaurant
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Restaurants ({restos?.length ?? 0})</h2>
        <Card className="rounded-2xl p-4">
          {(restos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun restaurant pour l’instant.</p>
          )}
          {(restos ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Canal Whapi</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(restos ?? []).map((r) => {
                  const chan = r.whapi_channels as unknown as {
                    id: string
                    token_encrypted: string
                    status: string
                    last_webhook_at: string | null
                  } | null
                  const sub = r.subscriptions as unknown as { plan: string } | null

                  return (
                    <RestaurantRow key={r.id} restaurantId={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">/{r.slug}</TableCell>
                      <TableCell>
                        <Badge variant={badgeVariantForChannel(chan?.status)}>
                          {channelLabel(chan?.status)}
                        </Badge>
                        {chan && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Dernier webhook : {chan.last_webhook_at ?? 'jamais'} · URL :{' '}
                            {process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/{chan.id}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{sub?.plan ?? '—'}</TableCell>
                      <ActionsCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          {chan && (
                            <form
                              action={configureWebhook.bind(
                                null,
                                chan.id,
                                decryptToken(chan.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
                              )}
                            >
                              <Button type="submit" size="sm" variant="outline">
                                Configurer le webhook
                              </Button>
                            </form>
                          )}
                          <Button size="sm" variant="outline" asChild>
                            <Link href={'/admin/restaurants/' + r.id}>Voir la fiche</Link>
                          </Button>
                        </div>
                      </ActionsCell>
                    </RestaurantRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  )
}
