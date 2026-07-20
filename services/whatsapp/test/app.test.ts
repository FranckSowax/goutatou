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

  describe('secret partagé du webhook (WEBHOOK_SHARED_SECRET)', () => {
    it('secret non configuré → comportement historique inchangé (200 sans query)', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook })
      const res = await request(app).post('/hook/chan-1').send({ messages: [] })
      expect(res.status).toBe(200)
      expect(processWebhook).toHaveBeenCalledWith('chan-1', { messages: [] })
    })

    it('secret configuré + ?s correct → 200 et délégation au processor', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook, webhookSharedSecret: 'sekret-123' })
      const res = await request(app).post('/hook/chan-1').query({ s: 'sekret-123' }).send({ messages: [] })
      expect(res.status).toBe(200)
      expect(processWebhook).toHaveBeenCalledWith('chan-1', { messages: [] })
    })

    it('secret configuré + ?s absent → 401 sans corps, processor jamais appelé', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook, webhookSharedSecret: 'sekret-123' })
      const res = await request(app).post('/hook/chan-1').send({ messages: [] })
      expect(res.status).toBe(401)
      expect(res.text).toBe('')
      expect(processWebhook).not.toHaveBeenCalled()
    })

    it('secret configuré + ?s faux (même longueur) → 401, processor jamais appelé', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook, webhookSharedSecret: 'sekret-123' })
      const res = await request(app).post('/hook/chan-1').query({ s: 'sekret-124' }).send({ messages: [] })
      expect(res.status).toBe(401)
      expect(processWebhook).not.toHaveBeenCalled()
    })

    it('secret configuré + ?s de longueur différente → 401 (pas de crash timingSafeEqual)', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook, webhookSharedSecret: 'sekret-123' })
      const res = await request(app).post('/hook/chan-1').query({ s: 'x' }).send({ messages: [] })
      expect(res.status).toBe(401)
      expect(processWebhook).not.toHaveBeenCalled()
    })

    it('secret configuré + ?s non-string (tableau) → 401, pas de crash', async () => {
      const processWebhook = vi.fn().mockResolvedValue(undefined)
      const app = createApp({ processWebhook, webhookSharedSecret: 'sekret-123' })
      const res = await request(app).post('/hook/chan-1?s=a&s=b').send({ messages: [] })
      expect(res.status).toBe(401)
      expect(processWebhook).not.toHaveBeenCalled()
    })

    it('GET /health reste public même avec secret configuré', async () => {
      const app = createApp({ processWebhook: vi.fn(), webhookSharedSecret: 'sekret-123' })
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
    })
  })
})
