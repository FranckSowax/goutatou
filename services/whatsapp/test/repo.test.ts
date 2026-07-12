import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cart } from '@goutatou/db'
import { createRepo } from '../src/repo.js'

/**
 * Stub minimal du client Supabase pour tester createRepo().getBotContext()
 * en isolation : reproduit la chaîne `.from('menu_categories').select().eq().order()`.
 */
function makeMenuSupabaseStub(catsData: unknown, restoData: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data: catsData })
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const slotsOrder = vi.fn().mockResolvedValue({ data: [] })
  const slotsEq2 = vi.fn().mockReturnValue({ order: slotsOrder })
  const slotsEq1 = vi.fn().mockReturnValue({ eq: slotsEq2 })
  const slotsSelect = vi.fn().mockReturnValue({ eq: slotsEq1 })
  const restoMaybeSingle = vi.fn().mockResolvedValue({ data: restoData })
  const restoEq = vi.fn().mockReturnValue({ maybeSingle: restoMaybeSingle })
  const restoSelect = vi.fn().mockReturnValue({ eq: restoEq })
  const from = vi.fn((table: string) => {
    if (table === 'menu_categories') return { select }
    if (table === 'drive_slots') return { select: slotsSelect }
    if (table === 'restaurants') return { select: restoSelect }
    throw new Error(`table inattendue : ${table}`)
  })
  return { db: { from } as unknown as SupabaseClient, select }
}

/** Stub minimal du client Supabase pour tester createRepo().createOrder() (appel rpc). */
function makeRpcSupabaseStub(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return { db: { from: vi.fn(), rpc } as unknown as SupabaseClient, rpc }
}

describe('createRepo — getBotContext (suppléments)', () => {
  it('joint menu_supplements disponibles, triés par position, dans le contexte machine', async () => {
    const cats = [{
      name: 'Plats', position: 0,
      menu_items: [
        {
          id: 'i1', name: 'Bo Bun', price: 4500, available: true, position: 0, photo_url: null,
          menu_supplements: [
            { id: 's2', name: 'Bœuf', price: 1000, available: true, position: 1 },
            { id: 's1', name: 'Œuf', price: 300, available: true, position: 0 },
            { id: 's3', name: 'Indispo', price: 500, available: false, position: 2 },
          ],
        },
        { id: 'i2', name: 'Nems', price: 2500, available: true, position: 1, photo_url: null, menu_supplements: [] },
      ],
    }]
    const { db } = makeMenuSupabaseStub(cats)
    const repo = createRepo(db, 'k'.repeat(32))
    const ctx = await repo.getBotContext('r1', 'Chez Test', true)

    expect(ctx.menu.categories[0].items[0]).toEqual({
      id: 'i1', name: 'Bo Bun', price: 4500, photoUrl: null,
      supplements: [
        { id: 's1', name: 'Œuf', price: 300 },
        { id: 's2', name: 'Bœuf', price: 1000 },
      ],
    })
    // Plat sans supplément dispo : tableau vide (forme B5 inchangée).
    expect(ctx.menu.categories[0].items[1].supplements).toEqual([])
  })
})

describe('createRepo — getBotContext (photo_url)', () => {
  it('mappe photo_url → photoUrl dans le menu bot', async () => {
    const cats = [{
      name: 'Plats', position: 0,
      menu_items: [
        {
          id: 'i1', name: 'Bo Bun', price: 4500, available: true, position: 0,
          photo_url: 'https://cdn.example.com/bo-bun.jpg', menu_supplements: [],
        },
        { id: 'i2', name: 'Nems', price: 2500, available: true, position: 1, photo_url: null, menu_supplements: [] },
      ],
    }]
    const { db } = makeMenuSupabaseStub(cats)
    const repo = createRepo(db, 'k'.repeat(32))
    const ctx = await repo.getBotContext('r1', 'Chez Test', true)

    expect(ctx.menu.categories[0].items[0].photoUrl).toBe('https://cdn.example.com/bo-bun.jpg')
    expect(ctx.menu.categories[0].items[1].photoUrl).toBeNull()
  })
})

describe('createRepo — hasWaProducts (catalogue WhatsApp natif)', () => {
  /** Stub minimal pour `.from('menu_items').select(..., {count}).eq().not()`. */
  function makeCountStub(count: number | null) {
    const not = vi.fn().mockResolvedValue({ count })
    const eq = vi.fn().mockReturnValue({ not })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn((table: string) => {
      if (table === 'menu_items') return { select }
      throw new Error(`table inattendue : ${table}`)
    })
    return { db: { from } as unknown as SupabaseClient, select, eq, not }
  }

  it('au moins un plat avec wa_product_id → true', async () => {
    const { db, not } = makeCountStub(3)
    const repo = createRepo(db, 'k'.repeat(32))
    await expect(repo.hasWaProducts('r1')).resolves.toBe(true)
    expect(not).toHaveBeenCalledWith('wa_product_id', 'is', null)
  })

  it('aucun plat synchronisé (count 0) → false', async () => {
    const { db } = makeCountStub(0)
    const repo = createRepo(db, 'k'.repeat(32))
    await expect(repo.hasWaProducts('r1')).resolves.toBe(false)
  })

  it('count null (défensif) → false', async () => {
    const { db } = makeCountStub(null)
    const repo = createRepo(db, 'k'.repeat(32))
    await expect(repo.hasWaProducts('r1')).resolves.toBe(false)
  })
})

describe('createRepo — createOrder (suppléments)', () => {
  it('mappe supplement_ids par ligne de panier, absent quand vide', async () => {
    const { db, rpc } = makeRpcSupabaseStub({ data: [{ order_id: 'o1', order_number: 7, total: 9800 }], error: null })
    const repo = createRepo(db, 'k'.repeat(32))
    const cart: Cart = {
      items: [
        { menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [{ id: 's1', name: 'Œuf', price: 300 }] },
        { menuItemId: 'i2', name: 'Nems', unitPrice: 2500, qty: 2 },
      ],
      mode: 'sur_place',
    }
    await repo.createOrder('r1', 'c1', cart)

    expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({
      p_items: [
        { menu_item_id: 'i1', qty: 1, supplement_ids: ['s1'] },
        { menu_item_id: 'i2', qty: 2 },
      ],
    }))
  })

  it('deux lignes panier même menuItemId, suppléments différents → deux entrées p_items distinctes', async () => {
    const { db, rpc } = makeRpcSupabaseStub({ data: [{ order_id: 'o1', order_number: 8, total: 11600 }], error: null })
    const repo = createRepo(db, 'k'.repeat(32))
    const cart: Cart = {
      items: [
        { menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [{ id: 's1', name: 'Œuf', price: 300 }] },
        { menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [{ id: 's2', name: 'Bœuf', price: 1000 }] },
      ],
      mode: 'sur_place',
    }
    await repo.createOrder('r1', 'c1', cart)

    expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({
      p_items: [
        { menu_item_id: 'i1', qty: 1, supplement_ids: ['s1'] },
        { menu_item_id: 'i1', qty: 1, supplement_ids: ['s2'] },
      ],
    }))
  })

  it('rétrocompat stricte : panier sans suppléments produit un p_items v1 inchangé', async () => {
    const { db, rpc } = makeRpcSupabaseStub({ data: [{ order_id: 'o1', order_number: 9, total: 4500 }], error: null })
    const repo = createRepo(db, 'k'.repeat(32))
    const cart: Cart = { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'sur_place' }
    await repo.createOrder('r1', 'c1', cart)

    expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({
      p_items: [{ menu_item_id: 'i1', qty: 1 }],
    }))
  })
})
