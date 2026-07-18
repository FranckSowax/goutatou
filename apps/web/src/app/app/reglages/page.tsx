import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { qrSvg } from '@/lib/qr'
import { Card } from '@/components/ui/card'
import { PageTabs } from '@/components/page-tabs'
import { PracticalInfoForm } from './practical-info-form'
import { MetaPixelForm } from './meta-pixel-form'
import { BotMessagesForm } from './bot-messages-form'
import { StaffGroupCard } from './staff-group-card'
import { LivreursForm } from './livreurs-form'
import { PaymentForm } from './payment-form'

export const dynamic = 'force-dynamic'

const REGLAGES_TABS = ['pratique', 'messages', 'paiement', 'livreurs', 'groupe'] as const
type ReglagesTab = (typeof REGLAGES_TABS)[number]

function parseTab(raw: string | undefined): ReglagesTab {
  return (REGLAGES_TABS as readonly string[]).includes(raw ?? '') ? (raw as ReglagesTab) : 'pratique'
}

export default async function ReglagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = parseTab(tabParam)

  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }
  const restaurantId = member.restaurant_id

  const { data: restaurant } = await supabase.from('restaurants')
    .select(
      'name, address, contact_phone, hours_text, delivery_info, bot_welcome, bot_info_extra, location_lat, location_lng, staff_group_id, staff_group_invite, meta_pixel_id, payment_cash_enabled, payment_airtel_enabled, payment_airtel_number, payment_airtel_name'
    )
    .eq('id', restaurantId)
    .single()

  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  const { data: livreurs } = await supabase
    .from('livreurs')
    .select('id, name, phone, active')
    .eq('restaurant_id', restaurantId)
    .order('active', { ascending: false })
    .order('name')

  const staffGroupSvg = restaurant?.staff_group_invite ? await qrSvg(restaurant.staff_group_invite) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Réglages</h1>

      <PageTabs
        tabs={[
          { value: 'pratique', label: 'Fiche pratique' },
          { value: 'messages', label: 'Messages du bot' },
          { value: 'paiement', label: 'Paiement' },
          { value: 'livreurs', label: 'Livreurs' },
          { value: 'groupe', label: 'Groupe cuisine' },
        ]}
        active={tab}
      />

      {tab === 'pratique' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,42rem)_1fr] lg:items-start">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Fiche pratique</h2>
            <Card className="rounded-2xl p-4">
              <PracticalInfoForm
                address={restaurant?.address ?? null}
                contactPhone={restaurant?.contact_phone ?? null}
                hoursText={restaurant?.hours_text ?? null}
                deliveryInfo={restaurant?.delivery_info ?? null}
                locationLat={restaurant?.location_lat ?? null}
                locationLng={restaurant?.location_lng ?? null}
              />
            </Card>

            <h2 className="font-display text-lg font-semibold">Publicité</h2>
            <Card className="rounded-2xl p-4">
              <MetaPixelForm metaPixelId={restaurant?.meta_pixel_id ?? null} />
            </Card>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-semibold">À quoi ça sert</h2>
            <Card className="rounded-2xl border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                Ces informations sont utilisées par le bot WhatsApp pour répondre automatiquement aux
                clients qui demandent l’adresse, les horaires ou les conditions de livraison.
              </p>
              <p className="mt-3">
                La position GPS permet au bot d’envoyer un lien Google Maps direct vers le restaurant.
              </p>
              <p className="mt-3">
                Le <strong>Meta Pixel</strong> trace les vues, ajouts au panier et achats de votre
                carte en ligne, pour mesurer et optimiser vos publicités Facebook / Instagram.
              </p>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'messages' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,42rem)_1fr] lg:items-start">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Messages du bot WhatsApp</h2>
            <Card className="rounded-2xl p-4">
              <BotMessagesForm
                botWelcome={restaurant?.bot_welcome ?? null}
                botInfoExtra={restaurant?.bot_info_extra ?? null}
              />
            </Card>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-semibold">À quoi ça sert</h2>
            <Card className="rounded-2xl border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                Le <strong>message d’accueil</strong> est envoyé dès qu’un client démarre une
                conversation avec votre bot WhatsApp.
              </p>
              <p className="mt-3">
                Les <strong>infos complémentaires</strong> sont ajoutées à la réponse du bot quand un
                client demande des informations sur le restaurant.
              </p>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'paiement' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,42rem)_1fr] lg:items-start">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Modes de paiement</h2>
            <Card className="rounded-2xl p-4">
              <PaymentForm
                cashEnabled={restaurant?.payment_cash_enabled ?? true}
                airtelEnabled={restaurant?.payment_airtel_enabled ?? false}
                airtelNumber={restaurant?.payment_airtel_number ?? null}
                airtelName={restaurant?.payment_airtel_name ?? null}
              />
            </Card>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-semibold">À quoi ça sert</h2>
            <Card className="rounded-2xl border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                Avec <strong>Airtel Money</strong> activé, le bot WhatsApp propose au client de payer
                sa commande par transfert : il reçoit votre numéro et le montant, puis répond avec sa
                référence de paiement.
              </p>
              <p className="mt-3">
                La commande arrive alors « à vérifier » : contrôlez la réception du transfert, puis
                cliquez <strong>Paiement reçu ✓</strong> sur la commande — la cuisine est prévenue à
                ce moment-là seulement.
              </p>
              <p className="mt-3">
                Si Airtel est désactivé, rien ne change : le client règle à la récupération ou à la
                livraison, comme aujourd’hui.
              </p>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'livreurs' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,42rem)_1fr] lg:items-start">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Livreurs</h2>
            <Card className="rounded-2xl p-4">
              <LivreursForm livreurs={livreurs ?? []} />
            </Card>
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <h2 className="font-display text-lg font-semibold">À quoi ça sert</h2>
            <Card className="rounded-2xl border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                Enregistrez vos livreurs (nom + numéro WhatsApp). Depuis la page <strong>Livraison</strong>,
                vous attribuez chaque commande à un livreur : il reçoit par WhatsApp le détail de la commande
                et un <strong>itinéraire Google Maps / Waze</strong> vers le client.
              </p>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'groupe' && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Groupe cuisine</h2>
          <Card className="rounded-2xl p-4">
            <StaffGroupCard
              restaurantName={restaurant?.name ?? ''}
              channelConnected={!!channel}
              contactPhone={restaurant?.contact_phone ?? null}
              staffGroupId={restaurant?.staff_group_id ?? null}
              invite={restaurant?.staff_group_invite ?? null}
              svg={staffGroupSvg}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
