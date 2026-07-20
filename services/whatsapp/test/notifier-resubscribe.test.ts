import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startNotifier } from '../src/notifier.js'

/**
 * Stub minimal du client Supabase realtime : channel() → builder chaînable, subscribe(cb)
 * capture le callback de statut pour pouvoir simuler SUBSCRIBED / CHANNEL_ERROR / etc.
 */
function fakeRealtimeDb() {
  const statusCallbacks: Array<(status: string) => void> = []
  const channels: object[] = []
  const db = {
    channel: vi.fn(() => {
      const ch = {
        on: vi.fn(() => ch),
        subscribe: vi.fn((cb: (status: string) => void) => {
          statusCallbacks.push(cb)
          return ch
        }),
      }
      channels.push(ch)
      return ch
    }),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  }
  return { db, statusCallbacks, channels }
}

describe('startNotifier — resouscription realtime (correctif fiabilité)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('SUBSCRIBED → aucune resouscription (comportement actuel conservé)', async () => {
    const { db, statusCallbacks } = fakeRealtimeDb()
    startNotifier(db as never, 'k'.repeat(64))
    expect(db.channel).toHaveBeenCalledTimes(1)

    statusCallbacks[0]('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(120000)
    expect(db.removeChannel).not.toHaveBeenCalled()
    expect(db.channel).toHaveBeenCalledTimes(1)
  })

  it('CHANNEL_ERROR → removeChannel puis re-création après 1 s de backoff', async () => {
    const { db, statusCallbacks, channels } = fakeRealtimeDb()
    startNotifier(db as never, 'k'.repeat(64))

    statusCallbacks[0]('CHANNEL_ERROR')
    // Avant le backoff : rien.
    await vi.advanceTimersByTimeAsync(999)
    expect(db.removeChannel).not.toHaveBeenCalled()
    expect(db.channel).toHaveBeenCalledTimes(1)
    // Après 1 s : removeChannel de l'ANCIEN channel, puis nouvelle subscription.
    await vi.advanceTimersByTimeAsync(1)
    expect(db.removeChannel).toHaveBeenCalledTimes(1)
    expect(db.removeChannel).toHaveBeenCalledWith(channels[0])
    expect(db.channel).toHaveBeenCalledTimes(2)
  })

  it('TIMED_OUT et CLOSED déclenchent aussi la resouscription', async () => {
    for (const status of ['TIMED_OUT', 'CLOSED']) {
      const { db, statusCallbacks } = fakeRealtimeDb()
      startNotifier(db as never, 'k'.repeat(64))
      statusCallbacks[0](status)
      await vi.advanceTimersByTimeAsync(1000)
      expect(db.channel).toHaveBeenCalledTimes(2)
    }
  })

  it('backoff exponentiel borné : 1 s → 2 s → 4 s, remis à 1 s après SUBSCRIBED', async () => {
    const { db, statusCallbacks } = fakeRealtimeDb()
    startNotifier(db as never, 'k'.repeat(64))

    // Échec 1 : resouscription après 1 s.
    statusCallbacks[0]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.channel).toHaveBeenCalledTimes(2)

    // Échec 2 : backoff doublé → 2 s (à 1 s, rien encore).
    statusCallbacks[1]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.channel).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.channel).toHaveBeenCalledTimes(3)

    // Échec 3 : 4 s.
    statusCallbacks[2]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(3999)
    expect(db.channel).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(db.channel).toHaveBeenCalledTimes(4)

    // SUBSCRIBED → reset : le prochain échec repart à 1 s.
    statusCallbacks[3]('SUBSCRIBED')
    statusCallbacks[3]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.channel).toHaveBeenCalledTimes(5)
  })

  it('backoff plafonné à 60 s', async () => {
    const { db, statusCallbacks } = fakeRealtimeDb()
    startNotifier(db as never, 'k'.repeat(64))

    // Enchaîne assez d'échecs pour dépasser le plafond (1,2,4,…,64 → borné à 60).
    for (let i = 0; i < 8; i++) {
      statusCallbacks[i]('CHANNEL_ERROR')
      await vi.advanceTimersByTimeAsync(60000)
      expect(db.channel).toHaveBeenCalledTimes(i + 2)
    }
    // 9e échec : le délai reste 60 s (pas 128 s).
    statusCallbacks[8]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(59999)
    expect(db.channel).toHaveBeenCalledTimes(9)
    await vi.advanceTimersByTimeAsync(1)
    expect(db.channel).toHaveBeenCalledTimes(10)
  })

  it('plusieurs statuts d’erreur du MÊME channel (CHANNEL_ERROR puis CLOSED) → UNE seule resouscription', async () => {
    const { db, statusCallbacks } = fakeRealtimeDb()
    startNotifier(db as never, 'k'.repeat(64))

    statusCallbacks[0]('CHANNEL_ERROR')
    statusCallbacks[0]('CLOSED')
    await vi.advanceTimersByTimeAsync(120000)
    expect(db.removeChannel).toHaveBeenCalledTimes(1)
    expect(db.channel).toHaveBeenCalledTimes(2)
  })

  it('removeChannel qui rejette n’empêche pas la resouscription', async () => {
    const { db, statusCallbacks } = fakeRealtimeDb()
    db.removeChannel = vi.fn().mockRejectedValue(new Error('ws down'))
    startNotifier(db as never, 'k'.repeat(64))

    statusCallbacks[0]('CHANNEL_ERROR')
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.channel).toHaveBeenCalledTimes(2)
  })
})
