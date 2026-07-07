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

export const EMPTY_CART: Cart = { items: [] }

export function cartTotal(cart: Cart): number {
  return cart.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
}

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`
}
