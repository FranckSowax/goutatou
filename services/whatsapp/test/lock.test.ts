import { describe, expect, it } from 'vitest'
import { createKeyedLock, withLock } from '../src/lock.js'

/** Petite promesse contrôlable à la main. */
function deferred() {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('createKeyedLock', () => {
  it('sérialise les appels d’une même clé en ordre FIFO', async () => {
    const lock = createKeyedLock()
    const order: string[] = []
    const gate = deferred()

    const p1 = lock('k', async () => { order.push('start-1'); await gate.promise; order.push('end-1') })
    const p2 = lock('k', async () => { order.push('start-2'); order.push('end-2') })
    const p3 = lock('k', async () => { order.push('start-3') })

    // Tant que le premier n'a pas fini, les suivants n'ont pas démarré.
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual(['start-1'])

    gate.resolve()
    await Promise.all([p1, p2, p3])
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3'])
  })

  it('des clés indépendantes ne se bloquent pas entre elles', async () => {
    const lock = createKeyedLock()
    const order: string[] = []
    const gate = deferred()

    const p1 = lock('resto-1:client-A', async () => { order.push('A-start'); await gate.promise; order.push('A-end') })
    const p2 = lock('resto-2:client-B', async () => { order.push('B-done') })

    await p2 // B passe SANS attendre A
    expect(order).toEqual(['A-start', 'B-done'])

    gate.resolve()
    await p1
    expect(order).toEqual(['A-start', 'B-done', 'A-end'])
  })

  it('libère le verrou après un throw : l’erreur remonte au SEUL appelant fautif, le suivant s’exécute', async () => {
    const lock = createKeyedLock()
    const order: string[] = []

    const p1 = lock('k', async () => { throw new Error('boom') })
    const p2 = lock('k', async () => { order.push('after-throw') })

    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBeUndefined()
    expect(order).toEqual(['after-throw'])
  })

  it('retourne la valeur de fn', async () => {
    const lock = createKeyedLock()
    await expect(lock('k', async () => 42)).resolves.toBe(42)
  })

  it('nettoie l’entrée quand la chaîne est vide (pas de fuite mémoire)', async () => {
    const lock = createKeyedLock()
    await lock('k', async () => undefined)
    expect(lock.size()).toBe(0)
    // Ré-acquisition sur clé nettoyée : fonctionne normalement.
    await expect(lock('k', async () => 'ok')).resolves.toBe('ok')
    expect(lock.size()).toBe(0)
  })

  it('withLock (instance partagée du module) fonctionne comme une instance créée', async () => {
    await expect(withLock('k-module', async () => 'ok')).resolves.toBe('ok')
  })
})
