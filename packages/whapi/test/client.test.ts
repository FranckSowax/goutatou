import { describe, expect, it, vi } from 'vitest'
import { WhapiClient, WhapiError } from '../src/client.js'

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body ?? {}), { status: r.status }))
  }
  return fn
}

describe('WhapiClient', () => {
  it('envoie un texte avec le bon endpoint, header et body', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'MSG1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendText('24177000001@s.whatsapp.net', 'Bonjour')
    expect(res.id).toBe('MSG1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/text')
    expect(init.headers['Authorization']).toBe('Bearer tok123')
    expect(JSON.parse(init.body)).toEqual({ to: '24177000001@s.whatsapp.net', body: 'Bonjour' })
  })

  it('retry sur 500 puis succès', async () => {
    const fetchFn = mockFetch([{ status: 500 }, { status: 200, body: { message: { id: 'M2' } } }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendText('x@s.whatsapp.net', 'y')
    expect(res.id).toBe('M2')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('échoue immédiatement sur 401 (pas de retry) avec WhapiError', async () => {
    const fetchFn = mockFetch([{ status: 401 }])
    const client = new WhapiClient('bad', { fetchFn, retryDelayMs: 0 })
    await expect(client.sendText('x@s.whatsapp.net', 'y')).rejects.toBeInstanceOf(WhapiError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('abandonne après 3 tentatives sur 5xx', async () => {
    const fetchFn = mockFetch([{ status: 502 }, { status: 502 }, { status: 502 }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    await expect(client.sendText('x@s.whatsapp.net', 'y')).rejects.toBeInstanceOf(WhapiError)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('sendInteractiveUrl : POST /messages/interactive avec bouton URL au format exact', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'MI1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendInteractiveUrl(
      '24177000001@s.whatsapp.net', 'Bravo !', '🎰 Tourner la roue', 'https://x.test/roue?t=abc',
    )
    expect(res.id).toBe('MI1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/interactive')
    expect(JSON.parse(init.body)).toEqual({
      to: '24177000001@s.whatsapp.net',
      type: 'button',
      body: { text: 'Bravo !' },
      action: {
        buttons: [{ type: 'url', title: '🎰 Tourner la roue', id: 'url-button', url: 'https://x.test/roue?t=abc' }],
      },
    })
  })

  it('checkContact : numéro enregistré (status valid) → true', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { contacts: [{ input: '24177000001', status: 'valid', wa_id: '24177000001@s.whatsapp.net' }] } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const ok = await client.checkContact('24177000001')
    expect(ok).toBe(true)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/contacts')
    expect(JSON.parse(init.body)).toEqual({ contacts: ['24177000001'] })
  })

  it('checkContact : numéro non enregistré (status invalid) → false', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { contacts: [{ input: '24177000001', status: 'invalid' }] } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const ok = await client.checkContact('24177000001')
    expect(ok).toBe(false)
  })

  it('configure le webhook au format Whapi exact', async () => {
    const fetchFn = mockFetch([{ status: 200 }])
    const client = new WhapiClient('t', { fetchFn, retryDelayMs: 0 })
    await client.setWebhook('https://bot.example.com/hook/abc')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/settings')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({
      webhooks: [{ mode: 'body', events: [{ type: 'messages', method: 'post' }], url: 'https://bot.example.com/hook/abc' }],
    })
  })
})
