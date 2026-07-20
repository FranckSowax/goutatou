import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EMPTY_CART } from '@goutatou/db'
import { createRepo, isBotState, isCart } from '../src/repo.js'

/** Stub de la chaîne `.from('conversations').select().eq().eq().maybeSingle()`. */
function makeConversationStub(row: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient
}

const KEY = 'k'.repeat(32)

describe('createRepo — loadConversation (relecture défensive, audit lot B correctif 4a)', () => {
  it('ligne absente → ACCUEIL + panier vide (inchangé)', async () => {
    const repo = createRepo(makeConversationStub(null), KEY)
    expect(await repo.loadConversation('r1', 'c1')).toEqual({ state: 'ACCUEIL', cart: EMPTY_CART })
  })

  it('état et panier valides → relus tels quels (aucune régression)', async () => {
    const cart = { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 2 }], mode: 'drive' }
    const repo = createRepo(makeConversationStub({ state: 'MENU', cart }), KEY)
    expect(await repo.loadConversation('r1', 'c1')).toEqual({ state: 'MENU', cart })
  })

  it('état inconnu (version antérieure, valeur corrompue) → repart sur ACCUEIL + panier vide', async () => {
    const repo = createRepo(makeConversationStub({ state: 'ANCIEN_ETAT', cart: { items: [] } }), KEY)
    expect(await repo.loadConversation('r1', 'c1')).toEqual({ state: 'ACCUEIL', cart: EMPTY_CART })
  })

  it('panier de forme invalide (items absent / non tableau / null) → ACCUEIL + panier vide', async () => {
    for (const cart of [null, {}, { items: 'nope' }, 42, [] as unknown]) {
      const repo = createRepo(makeConversationStub({ state: 'MENU', cart }), KEY)
      expect(await repo.loadConversation('r1', 'c1')).toEqual({ state: 'ACCUEIL', cart: EMPTY_CART })
    }
  })
})

describe('isBotState / isCart', () => {
  it('isBotState accepte tous les états du produit', () => {
    for (const s of ['ACCUEIL', 'MENU', 'MODE', 'CRENEAU', 'ADRESSE', 'CONFIRMATION', 'HUMAIN',
      'SUPPLEMENTS', 'SUPPLEMENTS_CHECKOUT', 'PAIEMENT', 'PAIEMENT_REF']) {
      expect(isBotState(s)).toBe(true)
    }
  })

  it('isBotState rejette le reste', () => {
    expect(isBotState('accueil')).toBe(false)
    expect(isBotState('')).toBe(false)
    expect(isBotState(null)).toBe(false)
    expect(isBotState(3)).toBe(false)
  })

  it('isCart exige un objet avec items tableau', () => {
    expect(isCart({ items: [] })).toBe(true)
    expect(isCart({ items: [{ qty: 1 }], mode: 'drive' })).toBe(true)
    expect(isCart({})).toBe(false)
    expect(isCart(null)).toBe(false)
    expect(isCart('{"items":[]}')).toBe(false)
  })
})
