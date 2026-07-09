export type OrderMode = 'drive' | 'livraison' | 'sur_place'
export type OrderStatus = 'recue' | 'en_preparation' | 'prete' | 'recuperee' | 'annulee'
export type BotState = 'ACCUEIL' | 'MENU' | 'MODE' | 'CRENEAU' | 'ADRESSE' | 'CONFIRMATION' | 'HUMAIN'

export interface CartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
}

export interface Cart {
  items: CartItem[]
  mode?: OrderMode
  driveSlotId?: string
  driveSlotLabel?: string
  address?: string
}

export interface MenuForBot {
  categories: { name: string; items: { id: string; name: string; price: number }[] }[]
}

export const EMPTY_CART: Cart = Object.freeze({
  items: Object.freeze([]) as unknown as CartItem[],
})

export function cartTotal(cart: Cart): number {
  return cart.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
}

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA`
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled'
export type RecipientStatus = 'pending' | 'sent' | 'failed'

export interface CampaignProgress {
  total: number
  sent: number
  failed: number
  pending: number
}

export function campaignProgress(total: number, sent: number, failed: number): CampaignProgress {
  return { total, sent, failed, pending: Math.max(0, total - sent - failed) }
}

export interface WheelPrize {
  id: string
  label: string
  weight: number
  stock: number
  active: boolean
}

export interface WheelSpinResult {
  prizeId: string
  label: string
  code: string
}

export function shouldOfferSpin(recuperatedCount: number, triggerN: number): boolean {
  return triggerN >= 1 && recuperatedCount > 0 && recuperatedCount % triggerN === 0
}
