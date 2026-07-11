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

  /**
   * Bouton interactif URL (POST /messages/interactive, type "button", action.buttons[0].type "url").
   * Schéma confirmé via la doc Whapi (INTERACTIVE ACTION OBJECT > buttons) : title/id/url sont les
   * champs du bouton ; `id` est requis par le schéma même pour un bouton url (pas de callback dessus).
   */
  async sendInteractiveUrl(to: string, body: string, buttonText: string, url: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/interactive', {
      to,
      type: 'button',
      body: { text: body },
      action: {
        buttons: [{ type: 'url', title: buttonText, id: 'url-button', url }],
      },
    })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }

  /**
   * Vérifie si un numéro est enregistré sur WhatsApp (POST /contacts, méthode recommandée par
   * Whapi — cf. "Check phones"). Réponse : { contacts: [{ input, status: 'valid'|'invalid', wa_id? }] }.
   */
  async checkContact(phone: string): Promise<boolean> {
    const res = (await this.request('POST', '/contacts', { contacts: [phone] })) as {
      contacts?: Array<{ status?: string }>
    }
    return res.contacts?.[0]?.status === 'valid'
  }

  async postStatusText(caption: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/story/text', { caption })) as {
      message?: { id?: string }
    }
    return { id: res.message?.id }
  }

  async postStatusMedia(mediaUrl: string, caption?: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/story/media', { media: mediaUrl, caption })) as {
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
