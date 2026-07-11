import { createSupabaseServer } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { PracticalInfoForm } from './practical-info-form'
import { BotMessagesForm } from './bot-messages-form'

export const dynamic = 'force-dynamic'

export default async function ReglagesPage() {
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

  const { data: restaurant } = await supabase.from('restaurants')
    .select('address, contact_phone, hours_text, delivery_info, bot_welcome, bot_info_extra')
    .eq('id', restaurantId)
    .single()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Réglages</h1>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Fiche pratique</h2>
        <Card className="rounded-2xl p-4">
          <PracticalInfoForm
            address={restaurant?.address ?? null}
            contactPhone={restaurant?.contact_phone ?? null}
            hoursText={restaurant?.hours_text ?? null}
            deliveryInfo={restaurant?.delivery_info ?? null}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Messages du bot WhatsApp</h2>
        <Card className="rounded-2xl p-4">
          <BotMessagesForm
            botWelcome={restaurant?.bot_welcome ?? null}
            botInfoExtra={restaurant?.bot_info_extra ?? null}
          />
        </Card>
      </section>
    </div>
  )
}
