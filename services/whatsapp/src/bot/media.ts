/**
 * Médias entrants NON pris en charge par le bot (lot C3 « UX bot », correctif 1) — logique PURE
 * (classification du type Whapi + copies FR + anti-spam en mémoire), aucun effet de bord : le
 * processor orchestre log/envoi.
 *
 * Contexte marché : au Gabon la note vocale est le mode dominant sur WhatsApp. Avant ce module,
 * tout message non text/location/order/reply était ignoré SILENCIEUSEMENT — le client envoyait
 * un vocal et n'obtenait aucune réponse, croyant que le restaurant l'ignorait. On répond
 * désormais une phrase courte, chaleureuse et actionnable (menu / humain).
 *
 * ALLOWLIST volontaire (plutôt qu'une liste noire des types gérés) : seuls les types réellement
 * ENVOYÉS PAR UN HUMAIN déclenchent une réponse. Les événements techniques que Whapi peut pousser
 * sur le même webhook (`system`, `action`, `call_log`, types futurs inconnus) restent silencieux —
 * y répondre produirait du bruit chez le client sans qu'il ait rien envoyé.
 */

export type MediaKind = 'voice' | 'media'

/** Types Whapi d'une note vocale / d'un fichier audio (ptt = push-to-talk, le vocal WhatsApp). */
const VOICE_TYPES = new Set(['audio', 'voice', 'ptt'])

/** Autres médias envoyés par un humain : photo, vidéo, sticker, document, gif, contact. */
const MEDIA_TYPES = new Set([
  'image', 'video', 'sticker', 'document', 'gif', 'contact', 'contacts', 'contact_list',
])

/**
 * Classe un `messages[n].type` entrant. `null` = aucune réponse « je ne sais pas » à envoyer,
 * soit parce que le type est DÉJÀ géré par le bot (text/location/order/reply), soit parce qu'il
 * ne provient pas d'un geste client (cf. allowlist ci-dessus).
 */
export function unsupportedMediaKind(type: string): MediaKind | null {
  const t = type.trim().toLowerCase()
  if (VOICE_TYPES.has(t)) return 'voice'
  if (MEDIA_TYPES.has(t)) return 'media'
  return null
}

/** Copies FR figées — même ton que src/bot/copy.ts (chaleureux, deux sorties actionnables). */
export const MEDIA_COPY = {
  voice:
    '🙏 Je ne sais pas encore écouter les messages vocaux. ' +
    'Écrivez-moi *menu* pour commander, ou *humain* pour parler à l’équipe.',
  media:
    '🙏 Je ne sais pas encore lire les photos et les fichiers. ' +
    'Écrivez-moi *menu* pour commander, ou *humain* pour parler à l’équipe.',
} as const

/** Libellé lisible pour `message_logs.body` (le média lui-même n'est jamais stocké). */
export function mediaLogBody(type: string, kind: MediaKind): string {
  return kind === 'voice' ? '🎤 Note vocale' : `📎 Pièce jointe (${type.trim().toLowerCase()})`
}

export interface MediaThrottle {
  /** `true` si une réponse « média non pris en charge » peut partir pour cette clé à `now`. */
  shouldReply(key: string, now: number): boolean
  /** Nombre de clés mémorisées (observabilité + tests). */
  size(): number
  /** Vide l'état (tests). */
  reset(): void
}

/**
 * Anti-spam par chat, EN MÉMOIRE — même choix (et mêmes limites assumées) que le mutex par client
 * de src/lock.ts.
 *
 * Pourquoi pas `message_logs` : la table ne porte ni le type de message ni de marqueur de nature
 * de la réponse ; il faudrait matcher le TEXTE sortant (`body = MEDIA_COPY.voice`) sur une fenêtre
 * temporelle, soit une requête supplémentaire ET fragile (toute retouche de copie casserait la
 * dédup). Une Map `restaurantId:chatId → timestamp du dernier envoi` coûte zéro requête.
 *
 * Limites assumées : verrou LOCAL au process (une seule instance du bot en prod) et perdu au
 * redémarrage. Pire cas : le client reçoit une réponse de plus — jamais une boucle. Les entrées
 * expirées sont purgées à chaque appel (aucune fuite mémoire au fil des semaines).
 */
export function createMediaThrottle(windowMs: number): MediaThrottle {
  const lastReplyAt = new Map<string, number>()

  return {
    shouldReply(key, now) {
      for (const [k, at] of lastReplyAt) {
        if (now - at > windowMs) lastReplyAt.delete(k)
      }
      const previous = lastReplyAt.get(key)
      if (previous !== undefined && now - previous <= windowMs) return false
      lastReplyAt.set(key, now)
      return true
    },
    size: () => lastReplyAt.size,
    reset: () => lastReplyAt.clear(),
  }
}

/** 10 minutes : un client qui enchaîne 5 vocaux reçoit UNE réponse, pas cinq. */
export const MEDIA_REPLY_WINDOW_MS = 10 * 60 * 1000

/** Instance partagée du service (une seule par process — cf. limite assumée ci-dessus). */
export const mediaThrottle: MediaThrottle = createMediaThrottle(MEDIA_REPLY_WINDOW_MS)
