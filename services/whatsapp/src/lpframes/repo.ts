import type { SupabaseClient } from '@supabase/supabase-js'
import { needsExtraction } from './ffmpeg.js'

export interface LpFramesCandidate {
  restaurantId: string
  mediaUrl: string
  lpConfig: unknown
}

export interface LpFrames {
  status: 'pending' | 'ready' | 'failed'
  sourceUrl: string
  baseUrl: string
  count: number
  width: number
  height: number
}

export interface LpFramesRepo {
  listCandidates(): Promise<LpFramesCandidate[]>
  setFrames(restaurantId: string, frames: LpFrames): Promise<void>
  uploadFrame(path: string, data: Buffer): Promise<void>
  publicUrl(path: string): string
}

const BUCKET = 'lp-media'

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Parsing minimal et défensif de lp_config.hero — on ne dépend PAS du code web
 * (packages différents). On ne lit que ce qu'il faut pour décider s'il y a
 * une extraction à faire.
 */
function parseCandidate(row: { id: string; lp_config: unknown }): LpFramesCandidate | null {
  const cfg = obj(row.lp_config)
  const hero = obj(cfg.hero)
  const mediaType = hero.mediaType === 'video' ? 'video' : 'image'
  const mediaUrl = strOrNull(hero.mediaUrl)
  const framesRaw = obj(hero.frames)
  const frames = typeof framesRaw.status === 'string' && typeof framesRaw.sourceUrl === 'string'
    ? { status: framesRaw.status, sourceUrl: framesRaw.sourceUrl }
    : null

  if (!needsExtraction({ mediaType, mediaUrl, frames })) return null
  if (!mediaUrl) return null
  return { restaurantId: row.id, mediaUrl, lpConfig: row.lp_config }
}

export function createLpFramesRepo(db: SupabaseClient): LpFramesRepo {
  return {
    async listCandidates() {
      const { data } = await db.from('restaurants').select('id, lp_config')
      return (data ?? [])
        .map((row) => parseCandidate(row as unknown as { id: string; lp_config: unknown }))
        .filter((c): c is LpFramesCandidate => c !== null)
    },

    async setFrames(restaurantId, frames) {
      // On relit le lp_config courant juste avant l'update pour ne fusionner
      // que hero.frames, sans écraser une édition admin concurrente.
      const { data } = await db.from('restaurants').select('lp_config')
        .eq('id', restaurantId).single()
      const cfg = obj(data?.lp_config)
      const hero = obj(cfg.hero)
      const next = { ...cfg, hero: { ...hero, frames } }
      await db.from('restaurants').update({ lp_config: next }).eq('id', restaurantId)
    },

    async uploadFrame(path, data) {
      const { error } = await db.storage.from(BUCKET).upload(path, data, {
        contentType: 'image/webp',
        upsert: true,
      })
      if (error) throw new Error(error.message)
    },

    publicUrl(path) {
      return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}
