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

  it('createNewsletter : POST /newsletters avec le bon body, parse id et invite', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { id: '120363@newsletter', invite: 'https://wa.me/channel/abc' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.createNewsletter('Promos Goutatou')
    expect(res).toEqual({ id: '120363@newsletter', invite: 'https://wa.me/channel/abc' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/newsletters')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Promos Goutatou' })
  })

  it('getNewsletter : GET /newsletters/{id}, parse id (repli sur l\'id demandé)/invite/name', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { invite: 'https://wa.me/channel/xyz', name: 'Promos Goutatou' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getNewsletter('120363@newsletter')
    expect(res).toEqual({ id: '120363@newsletter', invite: 'https://wa.me/channel/xyz', name: 'Promos Goutatou' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/newsletters/120363@newsletter')
    expect(init.method).toBe('GET')
  })

  it('sendNewsletterText : POST /messages/text avec to = ID @newsletter', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'NW1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendNewsletterText('120363@newsletter', 'Promo du jour')
    expect(res.id).toBe('NW1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/text')
    expect(JSON.parse(init.body)).toEqual({ to: '120363@newsletter', body: 'Promo du jour' })
  })

  it('sendNewsletterImage : POST /messages/image avec to = ID @newsletter', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'NW2' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendNewsletterImage('120363@newsletter', 'https://cdn.example.com/promo.jpg', 'Nouveau menu')
    expect(res.id).toBe('NW2')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/image')
    expect(JSON.parse(init.body)).toEqual({
      to: '120363@newsletter', media: 'https://cdn.example.com/promo.jpg', caption: 'Nouveau menu',
    })
  })

  it('getLoginQr : GET /users/login, parse base64', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { base64: 'data:image/png;base64,AAAA' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getLoginQr()
    expect(res).toEqual({ base64: 'data:image/png;base64,AAAA' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/users/login')
    expect(init.method).toBe('GET')
  })

  it('getLoginCode : GET /users/login/{PhoneNumber}, parse code', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { code: 'ABCD-1234' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getLoginCode('24177000001')
    expect(res).toEqual({ code: 'ABCD-1234' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/users/login/24177000001')
    expect(init.method).toBe('GET')
  })

  it('sendTyping : PUT /presences/{EntryID} avec presence "typing"', async () => {
    const fetchFn = mockFetch([{ status: 200 }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    await client.sendTyping('24177000001@s.whatsapp.net')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/presences/24177000001@s.whatsapp.net')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ presence: 'typing' })
  })

  it('markAsRead : PUT /messages/{MessageID}, sans body', async () => {
    const fetchFn = mockFetch([{ status: 200 }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    await client.markAsRead('p.w30M7fgwWD4XwHu.g4CA-gBgTwl0rVw')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/p.w30M7fgwWD4XwHu.g4CA-gBgTwl0rVw')
    expect(init.method).toBe('PUT')
    expect(init.body).toBeUndefined()
  })

  it('react : PUT /messages/{MessageID}/reaction avec le bon emoji', async () => {
    const fetchFn = mockFetch([{ status: 200 }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    await client.react('p.w30M7fgwWD4XwHu.g4CA-gBgTwl0rVw', '👍')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/p.w30M7fgwWD4XwHu.g4CA-gBgTwl0rVw/reaction')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ emoji: '👍' })
  })

  it('sendLocation : POST /messages/location avec lat/lng/name, parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'LOC1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendLocation('24177000001@s.whatsapp.net', 0.4162, 9.4673, 'Restaurant Goutatou')
    expect(res).toEqual({ id: 'LOC1' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/location')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      to: '24177000001@s.whatsapp.net',
      latitude: 0.4162,
      longitude: 9.4673,
      name: 'Restaurant Goutatou',
    })
  })

  it('createProduct : POST /business/products avec le body exact, image en tableau, parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { id: 'PROD1' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.createProduct({
      name: 'Poulet braisé',
      price: 3000,
      currency: 'XAF',
      retailer_id: '50000000-0000-0000-0000-000000000003',
      description: 'Poulet grillé, riz, plantain',
      imageUrl: 'https://cdn.example.com/poulet.jpg',
    })
    expect(res).toEqual({ id: 'PROD1' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/products')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      product_retailer_id: '50000000-0000-0000-0000-000000000003',
      currency: 'XAF',
      name: 'Poulet braisé',
      description: 'Poulet grillé, riz, plantain',
      price: 3000,
      images: ['https://cdn.example.com/poulet.jpg'],
    })
  })

  it('updateProduct : PATCH /business/products/{id} avec images en tableau', async () => {
    const fetchFn = mockFetch([{ status: 200, body: {} }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    await client.updateProduct('PROD1', { name: 'Poulet braisé XL', price: 3500, imageUrl: 'https://cdn.example.com/poulet2.jpg' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/products/PROD1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({
      name: 'Poulet braisé XL',
      price: 3500,
      images: ['https://cdn.example.com/poulet2.jpg'],
    })
  })

  it('deleteProduct : DELETE /business/products/{id}, sans body', async () => {
    const fetchFn = mockFetch([{ status: 200, body: {} }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    await client.deleteProduct('PROD1')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/products/PROD1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('getProducts : GET /business/products, parse liste sous `products` (id + retailer_id)', async () => {
    const fetchFn = mockFetch([
      {
        status: 200,
        body: {
          products: [
            { id: 'PROD1', product_retailer_id: '50000000-0000-0000-0000-000000000003', name: 'Poulet braisé', price: 3000 },
          ],
        },
      },
    ])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getProducts()
    expect(res).toEqual([
      { id: 'PROD1', retailer_id: '50000000-0000-0000-0000-000000000003', name: 'Poulet braisé', price: 3000 },
    ])
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/products')
    expect(init.method).toBe('GET')
  })

  it('sendCatalog : POST /business/catalogs/{to} avec to au chemin et au body, parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'CAT1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendCatalog('24177000001@s.whatsapp.net')
    expect(res).toEqual({ id: 'CAT1' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/catalogs/24177000001@s.whatsapp.net')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ to: '24177000001@s.whatsapp.net' })
  })

  it('sendPoll : POST /messages/poll avec title/options/count=1, parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'POLL1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendPoll('24177000001@s.whatsapp.net', 'Quel plat préférez-vous ?', ['Poulet', 'Poisson'])
    expect(res).toEqual({ id: 'POLL1' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/poll')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      to: '24177000001@s.whatsapp.net',
      title: 'Quel plat préférez-vous ?',
      options: ['Poulet', 'Poisson'],
      count: 1,
    })
  })

  it('sendQuiz : POST /messages/quiz avec title/options/correct_option_index, parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { message: { id: 'QUIZ1' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.sendQuiz('24177000001@s.whatsapp.net', 'Capitale du Gabon ?', ['Libreville', 'Douala', 'Yaoundé'], 0)
    expect(res).toEqual({ id: 'QUIZ1' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/messages/quiz')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      to: '24177000001@s.whatsapp.net',
      title: 'Capitale du Gabon ?',
      options: ['Libreville', 'Douala', 'Yaoundé'],
      correct_option_index: 0,
    })
  })

  it('createGroup : POST /groups avec subject + participants (requis), parse id', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { id: '120363194050948049@g.us' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.createGroup('Staff Goutatou', ['24177000001@s.whatsapp.net'])
    expect(res).toEqual({ id: '120363194050948049@g.us' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/groups')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      subject: 'Staff Goutatou',
      participants: ['24177000001@s.whatsapp.net'],
    })
  })

  it('createGroup : parse id en repli sous `group.id` si absent à la racine', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { group: { id: '120363000000000000@g.us' } } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.createGroup('Staff Goutatou', ['24177000001@s.whatsapp.net'])
    expect(res).toEqual({ id: '120363000000000000@g.us' })
  })

  it('getGroupInvite : GET /groups/{GroupID}/invite, parse `invite_code`', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { invite_code: 'ABC123xyz' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getGroupInvite('120363194050948049@g.us')
    expect(res).toEqual({ invite: 'ABC123xyz' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/groups/120363194050948049@g.us/invite')
    expect(init.method).toBe('GET')
  })

  it('getGroupInvite : parse en repli sur `link` si `invite_code` absent', async () => {
    const fetchFn = mockFetch([{ status: 200, body: { link: 'https://chat.whatsapp.com/ABC123xyz' } }])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getGroupInvite('120363194050948049@g.us')
    expect(res).toEqual({ invite: 'https://chat.whatsapp.com/ABC123xyz' })
  })

  it('getOrderItems : GET /business/orders/{id}, parse liste sous `items` (retailer_id/quantity/price)', async () => {
    const fetchFn = mockFetch([
      {
        status: 200,
        body: { items: [{ product_retailer_id: '50000000-0000-0000-0000-000000000003', quantity: 2, item_price: 3000 }] },
      },
    ])
    const client = new WhapiClient('tok123', { fetchFn, retryDelayMs: 0 })
    const res = await client.getOrderItems('ORDER1', 'b64tok==')
    expect(res).toEqual([{ retailer_id: '50000000-0000-0000-0000-000000000003', quantity: 2, price: 3000 }])
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://gate.whapi.cloud/business/orders/ORDER1?token=tok123&order_token=b64tok%3D%3D')
    expect(init.method).toBe('GET')
  })
})
