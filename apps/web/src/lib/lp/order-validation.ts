import { normalizeGabonPhone } from './wa'

export interface WebOrderPayload {
  customerName: string
  phone: string
  mode: 'drive' | 'livraison' | 'sur_place'
  driveSlotId?: string
  address?: string
  items: { menuItemId: string; qty: number; supplementIds?: string[] }[]
}

type Result = { ok: true; payload: WebOrderPayload } | { ok: false; error: string }

export function validateWebOrder(body: unknown): Result {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'Requête invalide.' }
  const b = body as Record<string, unknown>

  const customerName = typeof b.customerName === 'string' ? b.customerName.trim() : ''
  if (customerName.length < 2) return { ok: false, error: 'Indiquez votre nom.' }

  const phone = typeof b.phone === 'string' ? normalizeGabonPhone(b.phone) : null
  if (!phone) return { ok: false, error: 'Numéro WhatsApp invalide (ex. 077 12 34 56).' }

  const mode = b.mode
  if (mode !== 'drive' && mode !== 'livraison' && mode !== 'sur_place') {
    return { ok: false, error: 'Mode de récupération invalide.' }
  }

  const driveSlotId = typeof b.driveSlotId === 'string' && b.driveSlotId ? b.driveSlotId : undefined
  if (mode === 'drive' && !driveSlotId) return { ok: false, error: 'Choisissez un créneau de retrait.' }

  const address = typeof b.address === 'string' ? b.address.trim() : undefined
  if (mode === 'livraison' && (!address || address.length < 5)) {
    return { ok: false, error: 'Indiquez votre adresse de livraison.' }
  }

  const rawItems = Array.isArray(b.items) ? b.items : []
  const items: { menuItemId: string; qty: number; supplementIds?: string[] }[] = []
  for (const it of rawItems) {
    const o = it as Record<string, unknown>
    if (typeof o?.menuItemId !== 'string' || typeof o?.qty !== 'number') return { ok: false, error: 'Panier invalide.' }
    if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > 20) return { ok: false, error: 'Quantité invalide.' }

    let supplementIds: string[] | undefined
    if (o.supplementIds !== undefined) {
      if (!Array.isArray(o.supplementIds) || o.supplementIds.some((s) => typeof s !== 'string' || s.length === 0)) {
        return { ok: false, error: 'Panier invalide.' }
      }
      const deduped = [...new Set(o.supplementIds as string[])]
      if (deduped.length > 10) return { ok: false, error: 'Panier invalide.' }
      supplementIds = deduped
    }

    items.push({ menuItemId: o.menuItemId, qty: o.qty, ...(supplementIds ? { supplementIds } : {}) })
  }
  if (items.length < 1 || items.length > 15) return { ok: false, error: 'Votre panier est vide.' }

  return { ok: true, payload: { customerName, phone, mode, driveSlotId, address, items } }
}
