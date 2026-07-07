export class WhapiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'WhapiError'
  }
}

interface Opts {
  baseUrl?: string
  fetchFn?: typeof fetch
  retryDelayMs?: number
}

const MAX_ATTEMPTS = 3

export class WhapiClient {
  private baseUrl: string
  private fetchFn: typeof fetch
  private retryDelayMs: number

  constructor(private token: string, opts: Opts = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://gate.whapi.cloud'
    this.fetchFn = opts.fetchFn ?? fetch
    this.retryDelayMs = opts.retryDelayMs ?? 500
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** (attempt - 1)))
      try {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (res.ok) return res.json().catch(() => ({}))
        if (res.status >= 500) {
          lastError = new WhapiError(`Whapi ${res.status} sur ${path}`, res.status)
          continue // retry sur 5xx uniquement
        }
        throw new WhapiError(`Whapi ${res.status} sur ${path}`, res.status)
      } catch (err) {
        if (err instanceof WhapiError && err.status !== undefined && err.status < 500) throw err
        lastError = err // erreur réseau → retry
      }
    }
    throw lastError instanceof Error ? lastError : new WhapiError('échec réseau Whapi')
  }

  async sendText(to: string, body: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/text', { to, body })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }

  async sendImage(to: string, mediaUrl: string, caption?: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/image', { to, media: mediaUrl, caption })) as {
      message?: { id?: string }
    }
    return { id: res.message?.id }
  }

  async setWebhook(url: string): Promise<void> {
    await this.request('PATCH', '/settings', {
      webhooks: [{ mode: 'body', events: [{ type: 'messages', method: 'post' }], url }],
    })
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.request('GET', '/health')
      return true
    } catch {
      return false
    }
  }
}
