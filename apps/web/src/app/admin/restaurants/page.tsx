import Link from 'next/link'
import { decryptToken } from '@goutatou/db/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { configureWebhook } from '../actions'
import { RestaurantRow } from './restaurant-row'
import { ActionsCell } from './actions-cell'
import { NewRestaurantForm } from './new-restaurant-form'

export const dynamic = 'force-dynamic'

type WhapiChannelStatus = 'active' | 'error' | string

function badgeVariantForChannel(status: WhapiChannelStatus | undefined) {
  if (status === 'active') return 'success' as const
  if (status === 'qr' || status === 'disabled') return 'warning' as const
  if (status === 'error') return 'destructive' as const
  return 'muted' as const
}

function channelLabel(status: WhapiChannelStatus | undefined) {
  if (status === 'active') return 'Actif'
  if (status === 'disabled') return 'Désactivé'
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
      <NewRestaurantForm />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Restaurants ({restos?.length ?? 0})</h2>
        <Card className="rounded-2xl p-4">
          {(restos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun restaurant pour l’instant.</p>
          )}
          {(restos ?? []).length > 0 && (
            <>
              {/* ≥ md : tableau shadcn inchangé. */}
              <div className="hidden md:block">
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
              </div>

              {/* < md : une carte par restaurant. */}
              <div className="flex flex-col gap-3 md:hidden">
                {(restos ?? []).map((r) => {
                  const chan = r.whapi_channels as unknown as {
                    id: string
                    token_encrypted: string
                    status: string
                    last_webhook_at: string | null
                  } | null
                  const sub = r.subscriptions as unknown as { plan: string } | null

                  return (
                    <div key={r.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.name}</span>
                        <Badge variant={badgeVariantForChannel(chan?.status)}>
                          {channelLabel(chan?.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">/{r.slug}</p>
                      {chan && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Dernier webhook : {chan.last_webhook_at ?? 'jamais'} · URL :{' '}
                          {process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/{chan.id}
                        </p>
                      )}
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Plan : </span>
                        <span className="capitalize">{sub?.plan ?? '—'}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
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
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  )
}
