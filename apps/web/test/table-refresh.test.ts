import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  subscribeTableRefresh,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from '../src/lib/use-table-refresh'

interface Registration { table: string; filter: string | undefined; callback: () => void }

function fakeClient() {
  const registrations: Registration[] = []
  const removed: unknown[] = []
  const names: string[] = []
  let subscribeCalls = 0

  const channel: RealtimeChannelLike = {
    on(_event, config, callback) {
      registrations.push({
        table: config.table as string,
        filter: config.filter as string | undefined,
        callback,
      })
      return channel
    },
    subscribe() {
      subscribeCalls += 1
      return channel
    },
  }

  const client: RealtimeClientLike = {
    channel(name: string) {
      names.push(name)
      return channel
    },
    removeChannel(ch) {
      removed.push(ch)
      return Promise.resolve('ok')
    },
  }

  /** Simule un event Postgres sur `table` (toutes les callbacks abonnées à cette table). */
  const emit = (table: string) => {
    for (const r of registrations) if (r.table === table) r.callback()
  }

  return { client, channel, registrations, removed, names, emit, subscribeCalls: () => subscribeCalls }
}

describe('subscribeTableRefresh', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ouvre un seul canal pour toutes les tables, filtré par tenant', () => {
    const f = fakeClient()
    subscribeTableRefresh({
      client: f.client,
      channelName: 'deliveries-board',
      tables: ['deliveries', 'orders'],
      restaurantId: 'resto-1',
      onRefresh: () => {},
    })

    expect(f.names).toEqual(['deliveries-board-resto-1'])
    expect(f.subscribeCalls()).toBe(1)
    expect(f.registrations.map((r) => r.table)).toEqual(['deliveries', 'orders'])
    expect(f.registrations.every((r) => r.filter === 'restaurant_id=eq.resto-1')).toBe(true)
  })

  it('omet le filtre (et le suffixe de canal) sans restaurantId', () => {
    const f = fakeClient()
    subscribeTableRefresh({
      client: f.client,
      channelName: 'campaigns',
      tables: ['campaigns'],
      onRefresh: () => {},
    })

    expect(f.names).toEqual(['campaigns'])
    expect(f.registrations[0].filter).toBeUndefined()
  })

  it('debounce une rafale d’events en un seul refresh', () => {
    const f = fakeClient()
    const onRefresh = vi.fn()
    subscribeTableRefresh({
      client: f.client,
      channelName: 'orders-board',
      tables: ['orders'],
      restaurantId: 'r1',
      debounceMs: 500,
      onRefresh,
    })

    f.emit('orders')
    f.emit('orders')
    f.emit('orders')
    expect(onRefresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(onRefresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('ne compte qu’un refresh quand deux tables bougent pour le même fait métier', () => {
    const f = fakeClient()
    const onRefresh = vi.fn()
    subscribeTableRefresh({
      client: f.client,
      channelName: 'deliveries-board',
      tables: ['deliveries', 'orders'],
      restaurantId: 'r1',
      debounceMs: 300,
      onRefresh,
    })

    f.emit('orders')
    f.emit('deliveries')
    vi.advanceTimersByTime(300)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('redéclenche après la fenêtre de debounce', () => {
    const f = fakeClient()
    const onRefresh = vi.fn()
    subscribeTableRefresh({
      client: f.client,
      channelName: 'orders-board',
      tables: ['orders'],
      debounceMs: 200,
      onRefresh,
    })

    f.emit('orders')
    vi.advanceTimersByTime(200)
    f.emit('orders')
    vi.advanceTimersByTime(200)
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('nettoie : retire le canal et annule le refresh en vol', () => {
    const f = fakeClient()
    const onRefresh = vi.fn()
    const cleanup = subscribeTableRefresh({
      client: f.client,
      channelName: 'orders-board',
      tables: ['orders'],
      debounceMs: 500,
      onRefresh,
    })

    f.emit('orders')
    cleanup()

    expect(f.removed).toEqual([f.channel])
    vi.advanceTimersByTime(5_000)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
