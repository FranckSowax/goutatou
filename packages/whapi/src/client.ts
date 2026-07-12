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

  /**
   * Crée un canal (newsletter WhatsApp) — POST /newsletters. Endpoint et champ `name` confirmés
   * par .agents/skills/whapi/references/channels-management.md et whapi.readme.io/reference/createnewsletter.
   * La doc ne détaille pas le schéma exact de la réponse (pas d'exemple JSON affiché) : lecture
   * défensive de `id`/`invite`, tous deux optionnels — utiliser getNewsletter en repli si `invite`
   * manque à la création.
   */
  async createNewsletter(name: string): Promise<{ id?: string; invite?: string }> {
    const res = (await this.request('POST', '/newsletters', { name })) as { id?: string; invite?: string }
    return { id: res.id, invite: res.invite }
  }

  /**
   * Récupère les métadonnées d'un canal — GET /newsletters/{NewsletterID}. Endpoint confirmé par
   * channels-management.md et whapi.readme.io/reference/getnewsletter. Schéma de réponse non
   * détaillé par la doc (pas d'exemple JSON) : lecture défensive de `id`/`invite`/`name`.
   */
  async getNewsletter(id: string): Promise<{ id?: string; invite?: string; name?: string }> {
    const res = (await this.request('GET', `/newsletters/${id}`)) as { id?: string; invite?: string; name?: string }
    return { id: res.id ?? id, invite: res.invite, name: res.name }
  }

  /**
   * Envoie un texte à un canal : même endpoint POST /messages/text que sendText, avec `to` =
   * ID du canal au format `...@newsletter` (confirmé par channels-management.md, section
   * "Post to a Channel" : "Use the channel's @newsletter ID as the to field").
   */
  async sendNewsletterText(newsletterId: string, body: string): Promise<{ id?: string }> {
    return this.sendText(newsletterId, body)
  }

  /**
   * Envoie une image à un canal : même endpoint POST /messages/image que sendImage, avec `to` =
   * ID du canal au format `...@newsletter` (confirmé par channels-management.md).
   */
  async sendNewsletterImage(newsletterId: string, mediaUrl: string, caption?: string): Promise<{ id?: string }> {
    return this.sendImage(newsletterId, mediaUrl, caption)
  }

  /**
   * QR code de connexion à distance, en base64 — GET /users/login. Méthode et chemin confirmés
   * via whapi.readme.io/reference/loginuser (non documenté dans .agents/skills/whapi/references/).
   * Nom du champ `base64` INFÉRÉ de la description de l'outil MCP loginUser ("returns an image
   * of the type base64") — la doc readme.io n'affiche pas d'exemple de réponse JSON. À vérifier
   * contre une vraie réponse Whapi avant usage en prod.
   */
  async getLoginQr(): Promise<{ base64?: string }> {
    const res = (await this.request('GET', '/users/login')) as { base64?: string }
    return { base64: res.base64 }
  }

  /**
   * Code d'appairage à distance (sans QR) — GET /users/login/{PhoneNumber}. Méthode et chemin
   * confirmés via whapi.readme.io/reference/loginuserviaauthcode (non documenté dans
   * .agents/skills/whapi/references/). Nom du champ `code` INFÉRÉ de la description de l'outil
   * MCP loginUserViaAuthCode ("returns a code that allows you to connect the phone number...") —
   * la doc readme.io n'affiche pas d'exemple de réponse JSON. À vérifier avant usage en prod.
   */
  async getLoginCode(phone: string): Promise<{ code?: string }> {
    const res = (await this.request('GET', `/users/login/${phone}`)) as { code?: string }
    return { code: res.code }
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

  /**
   * Indicateur de présence « en train d'écrire » — PUT /presences/{EntryID}, body { presence }.
   * Endpoint, méthode et champs (presence: 'typing'|'recording'|'pause', delay optionnel)
   * confirmés par whapi.readme.io/reference/sendpresence ET recroisés avec le code généré du
   * serveur MCP whapi-mcp (généré depuis le schéma officiel Whapi). Confiance : haute.
   */
  async sendTyping(to: string): Promise<void> {
    await this.request('PUT', `/presences/${to}`, { presence: 'typing' })
  }

  /**
   * Marque un message entrant comme lu — PUT /messages/{MessageID}, sans body. Endpoint et
   * méthode confirmés par le code généré du serveur MCP whapi-mcp (généré depuis le schéma
   * officiel Whapi, cf. outil MCP markMessageAsRead). La page whapi.readme.io/reference/
   * markmessageasread était inaccessible au moment de la vérification (bloquée par la
   * protection anti-bot du site readme.io) : pas de recroisement avec la doc publique.
   * Confiance : moyenne-haute (source unique, mais fiable — mêmes générateurs qui ont produit
   * les schémas confirmés à l'identique pour sendPresence et sendMessageLocation ci-dessous).
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.request('PUT', `/messages/${messageId}`)
  }

  /**
   * Réagit à un message avec un emoji — PUT /messages/{MessageID}/reaction, body { emoji }.
   * Chemin et méthode confirmés par le code généré du serveur MCP whapi-mcp (généré depuis le
   * schéma officiel Whapi). Champs (MessageID, emoji) recroisés avec references/msg-text.md
   * (outil MCP reactToMessage). Idem markAsRead : doc whapi.readme.io/reference/reacttomessage
   * inaccessible au moment de la vérification (protection anti-bot). Confiance : moyenne-haute.
   */
  async react(messageId: string, emoji: string): Promise<void> {
    await this.request('PUT', `/messages/${messageId}/reaction`, { emoji })
  }

  /**
   * Envoie une localisation fixe — POST /messages/location, body { to, latitude, longitude,
   * name? }. Endpoint, méthode et champs confirmés par whapi.readme.io/reference/
   * sendmessagelocation ET recroisés avec le code généré du serveur MCP whapi-mcp. Forme de la
   * réponse ({ message: { id } }) INFÉRÉE par analogie avec les autres endpoints /messages/*
   * (sendText, sendImage) — la doc ne montre pas d'exemple JSON de réponse pour cet endpoint.
   * Confiance : haute sur la requête, moyenne sur la forme de la réponse.
   */
  async sendLocation(to: string, lat: number, lng: number, name?: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/messages/location', {
      to,
      latitude: lat,
      longitude: lng,
      name,
    })) as { message?: { id?: string } }
    return { id: res.message?.id }
  }

  /**
   * Crée un produit du catalogue WhatsApp Business — POST /business/products. Endpoint, méthode
   * et schéma du body (product_retailer_id, currency, images, availability, name, url,
   * description, price, is_hidden) confirmés à l'identique par le code généré du serveur MCP
   * whapi-mcp (généré depuis le schéma officiel Whapi — ~/.npm/_npx/.../whapi-mcp/generated-mcp/
   * createProduct.js + B_manifest.json) : requestBody.schema liste `currency`, `description`,
   * `images`, `name`, `price` comme REQUIS. Confiance : haute sur la requête.
   *
   * ATTENTION `images` est requis par le schéma Whapi (array, minItems 1) : un plat sans photo
   * ne peut pas être créé dans le catalogue tel quel. Cette méthode envoie `images: [imageUrl]`
   * si `imageUrl` est fourni, sinon omet le champ — l'appelant (worker de sync) doit filtrer les
   * plats sans photo en amont ou s'attendre à une erreur 400 de Whapi.
   *
   * Forme de la réponse (id du produit créé) NON documentée par whapi.readme.io/reference/
   * createproduct (page accessible mais sans exemple JSON affiché) et non détaillée dans le
   * manifeste MCP (outputSchema générique `{status, content}` = enveloppe de l'outil MCP, pas le
   * corps réel de l'API Whapi). Parsing défensif de `id` (racine ou sous `product`). Confiance :
   * moyenne sur la réponse — à vérifier contre un vrai appel avant usage en prod.
   */
  async createProduct(input: {
    name: string
    price: number
    currency: string
    retailer_id: string
    description?: string
    imageUrl?: string
  }): Promise<{ id?: string }> {
    const res = (await this.request('POST', '/business/products', {
      product_retailer_id: input.retailer_id,
      currency: input.currency,
      name: input.name,
      description: input.description,
      price: input.price,
      images: input.imageUrl ? [input.imageUrl] : undefined,
    })) as { id?: string; product?: { id?: string } }
    return { id: res.id ?? res.product?.id }
  }

  /**
   * Met à jour un produit du catalogue — PATCH /business/products/{ProductID}. Endpoint, méthode
   * et champs confirmés par le code généré whapi-mcp (updateProduct.js) et le manifeste MCP :
   * même schéma que createProduct. Confiance : haute sur la requête.
   *
   * ATTENTION (doc officielle, summary de l'outil MCP updateProduct) : « The *images* field is
   * required and must contain all images » — même en PATCH, Whapi attend le tableau `images`
   * complet à chaque mise à jour (pas de merge côté serveur). Cette méthode envoie
   * `images: [imageUrl]` si fourni ; si `imageUrl` est absent, aucun champ `images` n'est envoyé
   * et Whapi renverra probablement une erreur 400 — l'appelant doit toujours fournir `imageUrl`
   * pour un update réussi (le worker de sync doit garantir une photo par plat synchronisé).
   */
  async updateProduct(
    productId: string,
    fields: { name?: string; price?: number; currency?: string; description?: string; imageUrl?: string },
  ): Promise<void> {
    await this.request('PATCH', `/business/products/${productId}`, {
      currency: fields.currency,
      name: fields.name,
      description: fields.description,
      price: fields.price,
      images: fields.imageUrl ? [fields.imageUrl] : undefined,
    })
  }

  /**
   * Supprime un produit du catalogue — DELETE /business/products/{ProductID}, sans body.
   * Endpoint et méthode confirmés par le code généré whapi-mcp (deleteProduct.js) et le manifeste
   * MCP. Confiance : haute.
   */
  async deleteProduct(productId: string): Promise<void> {
    await this.request('DELETE', `/business/products/${productId}`)
  }

  /**
   * Liste les produits du catalogue — GET /business/products (query `count`, défaut 100 côté
   * Whapi ; `offset` pour la pagination — non gérée automatiquement ici, à itérer par l'appelant
   * si plus de 100 produits). Endpoint, méthode et query params confirmés par le code généré
   * whapi-mcp (getProducts.js) et le manifeste MCP. Confiance : haute sur la requête.
   *
   * Forme de la réponse NON documentée (pas d'exemple JSON sur whapi.readme.io/reference/
   * getproducts ni dans le manifeste MCP, qui ne détaille que l'enveloppe générique de l'outil).
   * Parsing défensif : liste sous `products`, sinon réponse déjà un tableau, sinon vide. Chaque
   * item : `id` (id Whapi) et `retailer_id` (notre id, champ `product_retailer_id` envoyé à la
   * création, lu ici en repli sur `retailer_id`). Confiance : moyenne — à vérifier contre un vrai
   * appel avant usage en prod.
   */
  async getProducts(): Promise<Array<{ id?: string; retailer_id?: string; name?: string; price?: number }>> {
    const res = (await this.request('GET', '/business/products')) as
      | { products?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>
    const list = Array.isArray(res) ? res : (res.products ?? [])
    return list.map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      retailer_id:
        typeof item.product_retailer_id === 'string'
          ? item.product_retailer_id
          : typeof item.retailer_id === 'string'
            ? item.retailer_id
            : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      price: typeof item.price === 'number' ? item.price : undefined,
    }))
  }

  /**
   * Envoie la carte catalogue en conversation — POST /business/catalogs/{ContactID}, body { to }.
   * Endpoint, méthode et body confirmés par le code généré whapi-mcp (sendCatalog.js) et le
   * manifeste MCP : `to` est requis dans le body EN PLUS de `ContactID` dans le chemin — le
   * manifeste ne précise pas si les deux doivent être identiques, mais c'est l'usage observé dans
   * tous les autres endpoints `/messages/*` de ce client (le contact cible apparaît une seule
   * fois en pratique) ; cette méthode envoie la même valeur aux deux emplacements par prudence.
   * Confiance : haute sur le chemin/la méthode, moyenne sur la redondance ContactID/`to`.
   *
   * Forme de la réponse INFÉRÉE par analogie avec les autres endpoints `/messages/*`
   * (`{ message: { id } }`) — non documentée pour cet endpoint spécifique. Confiance : moyenne.
   */
  async sendCatalog(to: string): Promise<{ id?: string }> {
    const res = (await this.request('POST', `/business/catalogs/${to}`, { to })) as {
      message?: { id?: string }
      id?: string
    }
    return { id: res.message?.id ?? res.id }
  }

  /**
   * Récupère les articles d'un panier WhatsApp natif entrant — GET /business/orders/{OrderID}.
   * Endpoint et méthode confirmés par le code généré whapi-mcp (getOrderItems.js) et le manifeste
   * MCP (summary "Get order items" : « get information about the items in the shopping cart sent
   * to you in messages »). Le paramètre optionnel `order_token` (query, "Base64 token from order
   * for receiving information") n'est PAS utilisé ici : le message webhook 'order' entrant ne
   * fournit qu'un `order.id` d'après la spec catalogue (processor à écrire séparément) — à
   * ajouter si un besoin de token apparaît. Confiance : haute sur le chemin/la méthode.
   *
   * Forme de la réponse NON documentée (support.whapi.cloud/.../get-order-items décrit le message
   * webhook entrant — order_id/seller/title/item_count/currency/total_price/status — mais pas le
   * corps de CETTE réponse GET). Parsing défensif inspiré du format WhatsApp Cloud API standard
   * (items sous `items` ou `products`, chaque item avec `product_retailer_id`/`retailer_id`,
   * `quantity`, `item_price`/`price`). Confiance : basse sur la forme exacte — à vérifier contre
   * un vrai panier WhatsApp avant usage en prod (cf. limite documentée dans la spec catalogue).
   */
  async getOrderItems(orderId: string): Promise<Array<{ retailer_id?: string; quantity?: number; price?: number }>> {
    const res = (await this.request('GET', `/business/orders/${orderId}`)) as
      | { items?: Array<Record<string, unknown>>; products?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>
    const list = Array.isArray(res) ? res : (res.items ?? res.products ?? [])
    return list.map((item) => ({
      retailer_id:
        typeof item.product_retailer_id === 'string'
          ? item.product_retailer_id
          : typeof item.retailer_id === 'string'
            ? item.retailer_id
            : typeof item.product_id === 'string'
              ? item.product_id
              : undefined,
      quantity: typeof item.quantity === 'number' ? item.quantity : typeof item.qty === 'number' ? item.qty : undefined,
      price: typeof item.item_price === 'number' ? item.item_price : typeof item.price === 'number' ? item.price : undefined,
    }))
  }
}
