import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, EMPTY_CART, type BotState, type Cart } from '@goutatou/db'
import type { BotContext } from './bot/machine.js'

export interface ChannelInfo {
  channelUuid: string
  restaurantId: string
  restaurantName: string
  token: string
  driveEnabled: boolean
}

export interface BotRepo {
  getChannel(channelUuid: string): Promise<ChannelInfo | null>
  getBotContext(restaurantId: string, restaurantName: string, driveEnabled: boolean): Promise<BotContext>
  upsertCustomer(restaurantId: string, phone: string, chatId: string, name?: string): Promise<{ id: string }>
  setOptedOut(restaurantId: string, customerId: string): Promise<void>
  loadConversation(restaurantId: string, customerId: string): Promise<{ state: BotState; cart: Cart }>
  saveConversation(restaurantId: string, customerId: string, state: BotState, cart: Cart): Promise<void>
  createOrder(restaurantId: string, customerId: string, cart: Cart): Promise<{ orderNumber: number; total: number }>
  logMessage(
    restaurantId: string, direction: 'in' | 'out', chatId: string,
    body: string | null, whapiMessageId?: string, error?: string,
  ): Promise<boolean>
}

export function createRepo(db: SupabaseClient, tokenKey: string): BotRepo {
  return {
    async getChannel(channelUuid) {
      const { data } = await db
        .from('whapi_channels')
        .select('id, restaurant_id, token_encrypted, status, restaurants(name, drive_enabled)')
        .eq('id', channelUuid)
        .single()
      if (!data || data.status !== 'active') return null
      const resto = data.restaurants as unknown as { name: string; drive_enabled: boolean }
      await db.from('whapi_channels').update({ last_webhook_at: new Date().toISOString() }).eq('id', channelUuid)
      return {
        channelUuid,
        restaurantId: data.restaurant_id,
        restaurantName: resto.name,
        token: decryptToken(data.token_encrypted, tokenKey),
        driveEnabled: resto.drive_enabled,
      }
    },

    async getBotContext(restaurantId, restaurantName, driveEnabled) {
      const [{ data: cats }, { data: slots }] = await Promise.all([
        db.from('menu_categories')
          .select('name, position, menu_items(id, name, price, available, position, photo_url, menu_supplements(id, name, price, available, position))')
          .eq('restaurant_id', restaurantId)
          .order('position'),
        db.from('drive_slots').select('id, label, position')
          .eq('restaurant_id', restaurantId).eq('active', true).order('position'),
      ])
      return {
        restaurantName,
        driveEnabled,
        driveSlots: (slots ?? []).map((s) => ({ id: s.id, label: s.label })),
        menu: {
          categories: (cats ?? []).map((c) => ({
            name: c.name,
            items: ((c.menu_items as {
              id: string; name: string; price: number; available: boolean; position: number
              photo_url: string | null
              menu_supplements: { id: string; name: string; price: number; available: boolean; position: number }[] | null
            }[]) ?? [])
              .filter((i) => i.available)
              .sort((a, b) => a.position - b.position)
              .map((i) => ({
                id: i.id, name: i.name, price: i.price, photoUrl: i.photo_url ?? null,
                supplements: (i.menu_supplements ?? [])
                  .filter((s) => s.available)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => ({ id: s.id, name: s.name, price: s.price })),
              })),
          })).filter((c) => c.items.length > 0),
        },
      }
    },

    async upsertCustomer(restaurantId, phone, chatId, name) {
      const { data, error } = await db
        .from('customers')
        .upsert(
          { restaurant_id: restaurantId, phone, chat_id: chatId, ...(name ? { name } : {}) },
          { onConflict: 'restaurant_id,phone' },
        )
        .select('id')
        .single()
      if (error || !data) throw new Error(`upsertCustomer: ${error?.message}`)
      return { id: data.id }
    },

    async setOptedOut(restaurantId, customerId) {
      const { error } = await db.from('customers').update({ opted_out: true })
        .eq('restaurant_id', restaurantId).eq('id', customerId)
      if (error) throw new Error(`setOptedOut: ${error.message}`)
    },

    async loadConversation(restaurantId, customerId) {
      const { data } = await db
        .from('conversations')
        .select('state, cart')
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', customerId)
        .maybeSingle()
      if (!data) return { state: 'ACCUEIL', cart: EMPTY_CART }
      return { state: data.state as BotState, cart: data.cart as Cart }
    },

    async saveConversation(restaurantId, customerId, state, cart) {
      const { error } = await db.from('conversations').upsert(
        { restaurant_id: restaurantId, customer_id: customerId, state, cart, updated_at: new Date().toISOString() },
        { onConflict: 'restaurant_id,customer_id' },
      )
      if (error) throw new Error(`saveConversation: ${error.message}`)
    },

    async createOrder(restaurantId, customerId, cart) {
      const { data, error } = await db.rpc('create_order', {
        p_restaurant_id: restaurantId,
        p_customer_id: customerId,
        p_source: 'whatsapp',
        p_mode: cart.mode,
        p_items: cart.items.map((it) => ({
          menu_item_id: it.menuItemId,
          qty: it.qty,
          ...(it.supplements && it.supplements.length > 0
            ? { supplement_ids: it.supplements.map((s) => s.id) }
            : {}),
        })),
        p_drive_slot_id: cart.driveSlotId ?? null,
        p_delivery_address: cart.address ?? null,
      })
      if (error || !data?.[0]) throw new Error(`create_order: ${error?.message}`)
      return { orderNumber: Number(data[0].order_number), total: data[0].total }
    },

    async logMessage(restaurantId, direction, chatId, body, whapiMessageId, error) {
      const { error: insertError } = await db.from('message_logs').insert({
        restaurant_id: restaurantId, direction, chat_id: chatId, body,
        whapi_message_id: whapiMessageId ?? null, error: error ?? null,
      })
      if (insertError?.code === '23505') return false // dédup : déjà traité
      if (insertError) throw new Error(`logMessage: ${insertError.message}`)
      return true
    },
  }
}
