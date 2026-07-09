import { describe, expect, it, vi } from 'vitest'
import { WhapiClient } from '../src/client.js'

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body ?? {}), { status: r.status }))
  }
  return fn
}

describe('WhapiClient — statuts', () => {
  it('publie un statut texte avec le bon endpoint et body', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'STA1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.postStatusText('Promo du jour: -20% sur les burgers')
    expect(res.id).toBe('STA1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/story/text')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer tok123')
    expect(JSON.parse(init.body)).toEqual({ caption: 'Promo du jour: -20% sur les burgers' })
  })

  it('publie un statut média avec le bon endpoint et body', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'STA2' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.postStatusMedia('https://cdn.example.com/promo.jpg', 'Nouveau menu')
    expect(res.id).toBe('STA2')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/story/media')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ media: 'https://cdn.example.com/promo.jpg', caption: 'Nouveau menu' })
  })
})
