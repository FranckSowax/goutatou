import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, EMPTY_CART, type BotState, type Cart } from '@goutatou/db'
import type { BotContext } from './bot/machine.js'
import type { BotProfile } from './bot/copy.js'

interface RestaurantProfileRow {
  address: string | null
  contact_phone: string | null
  hours_text: string | null
  delivery_info: string | null
  bot_welcome: string | null
  bot_info_extra: string | null
  location_lat: number | null
  location_lng: number | null
}

/** Fiche pratique (champs null/vides omis) — undefined si la fiche est entièrement vide. */
function mapProfile(row: RestaurantProfileRow | null): BotProfile | undefined {
  if (!row) return undefined
  const profile: BotProfile = {}
  if (row.address) profile.address = row.address
  if (row.contact_phone) profile.contactPhone = row.contact_phone
  if (row.hours_text) profile.hoursText = row.hours_text
  if (row.delivery_info) profile.deliveryInfo = row.delivery_info
  if (row.bot_info_extra) profile.infoExtra = row.bot_info_extra
  return Object.keys(profile).length > 0 ? profile : undefined
}

export interface ChannelInfo {
  channelUuid: string
  restaurantId: string
  restaurantName: string
  token: string
  driveEnabled: boolean
  /** Catalogue WhatsApp natif activé côté fiche resto (migration 0021). Absent/false = photos v1. */
  catalogEnabled?: boolean
}

/**
 * BotContext enrichi de la position GPS du restaurant (migration 0020). N'étend PAS
 * BotContext dans bot/machine.ts (contrat figé, cf. spec bot-vivant) : la machine pure
 * ignore ce champ, seul le processor le lit pour l'effet carte sur la commande "infos".
 */
export interface BotContextWithGps extends BotContext {
  gps?: { lat: number; lng: number }
}

export interface BotRepo {
  getChannel(channelUuid: string): Promise<ChannelInfo | null>
  getBotContext(restaurantId: string, restaurantName: string, driveEnabled: boolean): Promise<BotContextWithGps>
  upsertCustomer(restaurantId: string, phone: string, chatId: string, name?: string): Promise<{ id: string }>
  setOptedOut(restaurantId: string, customerId: string): Promise<void>
  /** Opt-in marketing explicite (mot-clé PROMOS) : n'altère PAS opted_out (critère audience v1). */
  setMarketingOptIn(restaurantId: string, customerId: string): Promise<void>
  /**
   * Progression roue pour CE client, pour le mot-clé *roue* uniquement (pas chargé sur
   * chaque message). orderCount = commandes *recuperee*, même critère que le déclencheur
   * réel (shouldOfferSpin / notifier.ts) pour une progression honnête.
   */
  getWheelInfo(restaurantId: string, customerId: string): Promise<{ enabled: boolean; triggerOrders: number; orderCount: number }>
  /**
   * `restaurants.loyalty_enabled` pour CE resto — lu uniquement sur les mots-clés carte/fidélité/roue
   * (jamais sur chaque message), pour décider si le bot répond la carte de fidélité (et si la roue
   * est remplacée). La génération du jeton/lien carte se fait côté processor (secret + cid).
   */
  getLoyaltyEnabled(restaurantId: string): Promise<boolean>
  /**
   * Le catalogue est considéré "synchronisé" dès qu'AU MOINS un plat porte un wa_product_id —
   * count head, appelé uniquement sur la commande *menu* quand catalog_enabled est vrai (cf.
   * spec catalogue § Conversation), jamais chargé sur chaque message.
   */
  hasWaProducts(restaurantId: string): Promise<boolean>
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
        .select('id, restaurant_id, token_encrypted, status, restaurants(name, drive_enabled, catalog_enabled)')
        .eq('id', channelUuid)
        .single()
      if (!data || data.status !== 'active') return null
      const resto = data.restaurants as unknown as { name: string; drive_enabled: boolean; catalog_enabled: boolean }
      await db.from('whapi_channels').update({ last_webhook_at: new Date().toISOString() }).eq('id', channelUuid)
      return {
        channelUuid,
        restaurantId: data.restaurant_id,
        restaurantName: resto.name,
        token: decryptToken(data.token_encrypted, tokenKey),
        driveEnabled: resto.drive_enabled,
        catalogEnabled: resto.catalog_enabled,
      }
    },

    async getBotContext(restaurantId, restaurantName, driveEnabled) {
      const [{ data: cats }, { data: slots }, { data: resto }] = await Promise.all([
        db.from('menu_categories')
          .select('name, position, menu_items(id, name, price, available, position, photo_url, wa_product_id, menu_supplements(id, name, price, available, position))')
          .eq('restaurant_id', restaurantId)
          .order('position'),
        db.from('drive_slots').select('id, label, position')
          .eq('restaurant_id', restaurantId).eq('active', true).order('position'),
        db.from('restaurants')
          .select('address, contact_phone, hours_text, delivery_info, bot_welcome, bot_info_extra, location_lat, location_lng')
          .eq('id', restaurantId)
          .maybeSingle(),
      ])
      const restoRow = (resto as RestaurantProfileRow | null) ?? null
      const profile = mapProfile(restoRow)
      const botWelcome = restoRow?.bot_welcome?.trim() || undefined
      const gps = restoRow?.location_lat != null && restoRow?.location_lng != null
        ? { lat: restoRow.location_lat, lng: restoRow.location_lng }
        : undefined
      return {
        restaurantName,
        driveEnabled,
        driveSlots: (slots ?? []).map((s) => ({ id: s.id, label: s.label })),
        ...(profile ? { profile } : {}),
        ...(botWelcome ? { botWelcome } : {}),
        ...(gps ? { gps } : {}),
        menu: {
          categories: (cats ?? []).map((c) => ({
            name: c.name,
            items: ((c.menu_items as {
              id: string; name: string; price: number; available: boolean; position: number
              photo_url: string | null; wa_product_id: string | null
              menu_supplements: { id: string; name: string; price: number; available: boolean; position: number }[] | null
            }[]) ?? [])
              .filter((i) => i.available)
              .sort((a, b) => a.position - b.position)
              .map((i) => ({
                id: i.id, name: i.name, price: i.price, photoUrl: i.photo_url ?? null,
                waProductId: i.wa_product_id ?? null,
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

    async setMarketingOptIn(restaurantId, customerId) {
      const { error } = await db.from('customers').update({ marketing_opt_in: true })
        .eq('restaurant_id', restaurantId).eq('id', customerId)
      if (error) throw new Error(`setMarketingOptIn: ${error.message}`)
    },

    async getWheelInfo(restaurantId, customerId) {
      const [{ data: resto }, { count }] = await Promise.all([
        db.from('restaurants').select('wheel_enabled, wheel_trigger_orders').eq('id', restaurantId).single(),
        db.from('orders').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId).eq('customer_id', customerId).eq('status', 'recuperee'),
      ])
      return {
        enabled: resto?.wheel_enabled ?? false,
        triggerOrders: resto?.wheel_trigger_orders ?? 1,
        orderCount: count ?? 0,
      }
    },

    async getLoyaltyEnabled(restaurantId) {
      const { data } = await db.from('restaurants').select('loyalty_enabled').eq('id', restaurantId).single()
      return data?.loyalty_enabled ?? false
    },

    async hasWaProducts(restaurantId) {
      const { count } = await db
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .not('wa_product_id', 'is', null)
      return (count ?? 0) > 0
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
