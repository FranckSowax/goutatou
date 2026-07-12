import type { WhapiClient } from '@goutatou/whapi'
import type { DueStatus, StatusRepo } from './repo.js'

export interface StatusWorkerDeps {
  repo: StatusRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'postStatusText' | 'postStatusMedia'>
}

const NO_OPTIN_ERROR = 'Aucun client opt-in pour ce statut VIP.'

/**
 * Whapi attend un enum de chaînes pour font_type (SYSTEM, SYSTEM_BOLD, ... cf. commentaire
 * packages/whapi/src/client.ts postStatusText), alors que statuses.font_type est un entier 0-5
 * (contrat partagé avec le web, apps/web .../statuts/shared.ts FONT_STYLES). La conversion
 * index→enum est explicitement laissée « à la charge de l'appelant » : c'est ici.
 */
const FONT_TYPE_MAP = [
  'SYSTEM', // 0 — Sans
  'SYSTEM_BOLD', // 1 — Grasse
  'CALISTOGA_REGULAR', // 2 — Élégante
  'COURIERPRIME_BOLD', // 3 — Machine
  'MORNINGBREEZE_REGULAR', // 4 — Manuscrite
  'EXO2_EXTRABOLD', // 5 — Affiche
]

function fontTypeToEnum(fontType: number | null | undefined): string | undefined {
  if (fontType === null || fontType === undefined) return undefined
  return FONT_TYPE_MAP[fontType]
}

type TextOpts = { backgroundColor?: string; captionColor?: string; fontType?: string; contacts?: string[] }
type MediaOpts = { mime?: string; contacts?: string[] }

/** N'inclut que les champs définis ; renvoie `undefined` si rien à transmettre — préserve les
 * appels 1-arg / 2-arg existants (rétrocompatibilité stricte du status worker + ses tests). */
function buildTextOpts(s: DueStatus, contacts?: string[]): TextOpts | undefined {
  const opts: TextOpts = {}
  if (s.bgColor) opts.backgroundColor = s.bgColor
  const fontType = fontTypeToEnum(s.fontType)
  if (s.captionColor) opts.captionColor = s.captionColor
  if (fontType) opts.fontType = fontType
  if (contacts) opts.contacts = contacts
  return Object.keys(opts).length > 0 ? opts : undefined
}

function buildMediaOpts(mime: string | undefined, contacts: string[] | undefined): MediaOpts | undefined {
  const opts: MediaOpts = {}
  if (mime) opts.mime = mime
  if (contacts) opts.contacts = contacts
  return Object.keys(opts).length > 0 ? opts : undefined
}

export async function processStatusOnce(s: DueStatus, deps: StatusWorkerDeps): Promise<void> {
  const channel = await deps.repo.getChannel(s.restaurantId)
  if (!channel || channel.status !== 'active') {
    await deps.repo.markFailed(s.id, 'canal inactif')
    return
  }

  let contacts: string[] | undefined
  if (s.audience === 'optin') {
    const optIn = await deps.repo.optInChatIds(s.restaurantId)
    if (optIn.length === 0) {
      await deps.repo.markFailed(s.id, NO_OPTIN_ERROR)
      return
    }
    contacts = optIn
  }

  const whapi = deps.makeWhapi(channel.token)
  try {
    let res: { id?: string }
    if (s.kind === 'video' && s.mediaUrl) {
      const opts = buildMediaOpts('video/mp4', contacts)
      res = opts ? await whapi.postStatusMedia(s.mediaUrl, s.content, opts) : await whapi.postStatusMedia(s.mediaUrl, s.content)
    } else if (s.kind === 'image' && s.mediaUrl) {
      const opts = buildMediaOpts(undefined, contacts)
      res = opts ? await whapi.postStatusMedia(s.mediaUrl, s.content, opts) : await whapi.postStatusMedia(s.mediaUrl, s.content)
    } else {
      const opts = buildTextOpts(s, contacts)
      res = opts ? await whapi.postStatusText(s.content, opts) : await whapi.postStatusText(s.content)
    }
    await deps.repo.markPosted(s.id, res.id)
  } catch (err) {
    await deps.repo.markFailed(s.id, String(err))
  }
}

export function startStatusWorker(deps: StatusWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimDue(new Date().toISOString())
      for (const s of due) {
        await processStatusOnce(s, deps)
      }
    } catch (err) {
      console.error('[status-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[status-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
