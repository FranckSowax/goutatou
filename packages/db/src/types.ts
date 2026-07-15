export type OrderMode = 'drive' | 'livraison' | 'sur_place'
export type OrderStatus = 'recue' | 'en_preparation' | 'prete' | 'recuperee' | 'annulee'
export type BotState =
  | 'ACCUEIL' | 'MENU' | 'MODE' | 'CRENEAU' | 'ADRESSE' | 'CONFIRMATION' | 'HUMAIN' | 'SUPPLEMENTS'
  | 'SUPPLEMENTS_CHECKOUT'

export interface SupplementLine {
  id: string
  name: string
  price: number
}

export interface CartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
  /** Suppléments choisis pour cet item (défaut : absent = aucun, rétrocompatible). */
  supplements?: SupplementLine[]
  /**
   * Marque que la question suppléments a déjà été posée pour cet item dans le cadre de
   * SUPPLEMENTS_CHECKOUT (panier importé). Transient, défaut absent = pas encore demandé.
   * Ignoré par cartTotal/cartRecap et tout autre consommateur — sert uniquement à la
   * rotation interne de la machine (cf. machine.ts, nextUnaskedSupplementIndex).
   */
  suppAsked?: boolean
}

export interface Cart {
  items: CartItem[]
  mode?: OrderMode
  driveSlotId?: string
  driveSlotLabel?: string
  address?: string
}

export interface MenuForBot {
  categories: {
    name: string
    items: {
      id: string; name: string; price: number; supplements?: SupplementLine[]
      /** Optionnel : rétrocompatible avec les fixtures existantes qui ne le fournissent pas. */
      photoUrl?: string | null
      /** Id produit du catalogue WhatsApp — clé de mapping des paniers natifs entrants. */
      waProductId?: string | null
    }[]
  }[]
}

/** Fiche pratique + messages bot d'un restaurant (migration 0018) — null = non renseigné. */
export interface RestaurantProfile {
  address: string | null
  contactPhone: string | null
  hoursText: string | null
  deliveryInfo: string | null
  botWelcome: string | null
  botInfoExtra: string | null
}

export const EMPTY_CART: Cart = Object.freeze({
  items: Object.freeze([]) as unknown as CartItem[],
})

export function cartTotal(cart: Cart): number {
  return cart.items.reduce((sum, it) => {
    const supplementsTotal = (it.supplements ?? []).reduce((s, sup) => s + sup.price, 0)
    return sum + (it.unitPrice + supplementsTotal) * it.qty
  }, 0)
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
  /** Optionnel : rétrocompatible avec les lots existants sans image (roue v2). */
  imageUrl?: string | null
}

export interface WheelSpinResult {
  prizeId: string
  label: string
  code: string
}

export function shouldOfferSpin(recuperatedCount: number, triggerN: number): boolean {
  return triggerN >= 1 && recuperatedCount > 0 && recuperatedCount % triggerN === 0
}

// 'pending_approval' ajouté par la migration 0025 (validation statuts, cf.
// docs/superpowers/specs/2026-07-13-validation-statuts-design.md) : statut auto en attente
// de validation gérant/groupe avant de passer à 'scheduled' (ou 'canceled' sur refus/expiration).
export type StatusState = 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed' | 'canceled' | 'pending_approval'
export type StatusKind = 'text' | 'image'

const STATUS_LABELS: Record<StatusState, string> = {
  draft: 'Brouillon',
  scheduled: 'Programmé',
  posting: 'Publication…',
  posted: 'Publié',
  failed: 'Échec',
  canceled: 'Annulé',
  pending_approval: 'En attente de validation',
}

export function statusStateLabel(s: StatusState): string {
  return STATUS_LABELS[s]
}

// Chaîne Auto — posts programmés/auto sur le canal WhatsApp (migration 0026, cf.
// docs/superpowers/plans/2026-07-13-chaine-auto-premium.md). Pas de type Restaurant/Status
// explicite dans ce package pour les colonnes auto_channel_*/echo_to_channel — les repos
// lisent en colonnes brutes, cf. RestaurantProfile qui ne couvre que la fiche pratique (0018).
export type ChannelPostKind = 'text' | 'image' | 'video' | 'menu_card' | 'poll'
export type ChannelPostState =
  | 'scheduled' | 'pending_approval' | 'posting' | 'posted' | 'failed' | 'canceled'

// Sondages v2 (migration 0027, spec docs/superpowers/specs/2026-07-13-sondages-v2-design.md) :
// surfaces de publication d'un même sondage natif. Pas de type Poll explicite dans ce package
// (les repos lisent en colonnes brutes) — on n'ajoute donc que le type de surface.
export type PollSurface = 'channel' | 'group' | 'status_teaser'

// Roue QR + action sociale (migration 0028, cf.
// docs/superpowers/plans/2026-07-13-roue-qr-sociale.md) : action déclarative honor-system
// choisie avant de tourner, et provenance du tour (v2 après-commande vs QR public).
export type WheelAction = 'google' | 'tiktok' | 'channel'
export type WheelSpinSource = 'order' | 'qr_public'
