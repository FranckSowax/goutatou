import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('app', () => {
  it('GET /health répond ok', async () => {
    const app = createApp({ processWebhook: vi.fn() })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('POST /hook/:channelUuid répond 200 immédiatement et délègue au processor', async () => {
    const processWebhook = vi.fn().mockResolvedValue(undefined)
    const app = createApp({ processWebhook })
    const res = await request(app).post('/hook/chan-1').send({ messages: [] })
    expect(res.status).toBe(200)
    expect(processWebhook).toHaveBeenCalledWith('chan-1', { messages: [] })
  })

  it('répond 200 même si le processor rejette (jamais de 500 vers Whapi)', async () => {
    const processWebhook = vi.fn().mockRejectedValue(new Error('boom'))
    const app = createApp({ processWebhook })
    const res = await request(app).post('/hook/chan-1').send({ messages: [] })
    expect(res.status).toBe(200)
  })
})
