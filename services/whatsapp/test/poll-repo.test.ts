import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptToken } from '@goutatou/db'
import { createPollRepo } from '../src/polls/repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (supabase-js). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'update', 'order', 'single']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown }) => unknown) => Promise.resolve({ data: finalData }).then(resolve)
  return chain
}

describe('createPollRepo — claimQueued', () => {
  it('lit les sondages queued dont le resto a un canal actif puis claim par update conditionnel', async () => {
    const selectChain = makeChain([
      { id: 'p1', restaurant_id: 'r1', question: 'Aimez-vous le poulet ?', options: ['Oui', 'Non'], quiz_correct: null, target: 'channel' },
    ])
    const updateChain = makeChain([
      { id: 'p1', restaurant_id: 'r1', question: 'Aimez-vous le poulet ?', options: ['Oui', 'Non'], quiz_correct: null, target: 'channel' },
    ])
    const from = vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimQueued()

    expect(due).toEqual([
      { id: 'p1', restaurantId: 'r1', question: 'Aimez-vous le poulet ?', options: ['Oui', 'Non'], quizCorrect: null, target: 'channel' },
    ])
    expect(selectChain.select).toHaveBeenCalledWith(
      expect.stringContaining('whapi_channels!inner(status)'),
    )
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'queued')
    expect(selectChain.eq).toHaveBeenCalledWith('restaurants.whapi_channels.status', 'active')
    expect(updateChain.update).toHaveBeenCalledWith({ status: 'sending' })
    expect(updateChain.in).toHaveBeenCalledWith('id', ['p1'])
    expect(updateChain.eq).toHaveBeenCalledWith('status', 'queued')
  })

  it('aucun sondage dû → tableau vide, pas de requête de claim (update)', async () => {
    const selectChain = makeChain([])
    const from = vi.fn().mockReturnValueOnce(selectChain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimQueued()

    expect(due).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })
})

describe('createPollRepo — getChannel', () => {
  it('déchiffre le token, renvoie le statut et le wa_channel_id du resto', async () => {
    const encrypted = encryptToken('tok-secret', TOKEN_KEY)
    const chain = makeChain({ wa_channel_id: 'chan-1', whapi_channels: { token_encrypted: encrypted, status: 'active' } })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const channel = await repo.getChannel('r1')

    expect(channel).toEqual({ token: 'tok-secret', status: 'active', waChannelId: 'chan-1' })
  })

  it('aucun canal Whapi → null', async () => {
    const chain = makeChain({ wa_channel_id: null, whapi_channels: null })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.getChannel('r1')).toBeNull()
  })

  it('aucun resto trouvé → null', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.getChannel('r1')).toBeNull()
  })
})

describe('createPollRepo — optInChatIds', () => {
  it('ne retient que marketing_opt_in=true et opted_out=false', async () => {
    const chain = makeChain([{ chat_id: '1@s.whatsapp.net' }, { chat_id: '2@s.whatsapp.net' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const ids = await repo.optInChatIds('r1')

    expect(ids).toEqual(['1@s.whatsapp.net', '2@s.whatsapp.net'])
    expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
    expect(chain.eq).toHaveBeenCalledWith('marketing_opt_in', true)
    expect(chain.eq).toHaveBeenCalledWith('opted_out', false)
  })
})

describe('createPollRepo — finish', () => {
  it('status sent → écrit sent_count, error null, sent_at renseigné', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.finish('p1', { status: 'sent', sentCount: 3 })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'sent', sent_count: 3, error: null,
    }))
    const call = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as { sent_at: string | null }
    expect(call.sent_at).not.toBeNull()
    expect(chain.eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('status failed → sent_at null, error transmis', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createPollRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.finish('p1', { status: 'failed', sentCount: 0, error: 'Aucun client opt-in — faites scanner votre QR PROMOS.' })

    expect(chain.update).toHaveBeenCalledWith({
      status: 'failed', sent_count: 0, error: 'Aucun client opt-in — faites scanner votre QR PROMOS.', sent_at: null,
    })
  })
})
