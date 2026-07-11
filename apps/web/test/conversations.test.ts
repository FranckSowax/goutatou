import { describe, expect, it } from 'vitest'
import {
  formatPhoneDisplay,
  groupConversations,
  threadFor,
  type ConversationCustomer,
  type ConversationLog,
} from '../src/lib/conversations'

const log = (
  id: string, chatId: string, createdAt: string,
  opts: Partial<Pick<ConversationLog, 'direction' | 'body' | 'error'>> = {},
): ConversationLog => ({
  id, chat_id: chatId, created_at: createdAt,
  direction: opts.direction ?? 'in',
  body: 'body' in opts ? opts.body ?? null : 'salut',
  error: opts.error ?? null,
})

describe('formatPhoneDisplay', () => {
  it('formate un numéro gabonais reconnu en groupes de 2', () => {
    expect(formatPhoneDisplay('24177123456')).toBe('+241 77 12 34 56')
    expect(formatPhoneDisplay('077123456')).toBe('+241 77 12 34 56')
  })
  it('renvoie la valeur brute si non reconnaissable', () => {
    expect(formatPhoneDisplay('abc')).toBe('abc')
  })
})

describe('groupConversations', () => {
  it('regroupe les logs de plusieurs chats en une entrée par chat_id', () => {
    const logs = [
      log('1', 'chatA', '2026-07-11T10:00:00Z'),
      log('2', 'chatB', '2026-07-11T09:00:00Z'),
      log('3', 'chatA', '2026-07-11T10:05:00Z'),
    ]
    const result = groupConversations(logs, [])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.chatId).sort()).toEqual(['chatA', 'chatB'])
  })

  it('trie par lastAt décroissant', () => {
    const logs = [
      log('1', 'chatOld', '2026-07-10T08:00:00Z'),
      log('2', 'chatNew', '2026-07-11T12:00:00Z'),
      log('3', 'chatMid', '2026-07-11T00:00:00Z'),
    ]
    const result = groupConversations(logs, [])
    expect(result.map((r) => r.chatId)).toEqual(['chatNew', 'chatMid', 'chatOld'])
  })

  it('nom = customer.name si présent', () => {
    const logs = [log('1', '24177000001@s.whatsapp.net', '2026-07-11T10:00:00Z')]
    const customers: ConversationCustomer[] = [
      { chat_id: '24177000001@s.whatsapp.net', name: 'Awa', phone: '24177000001' },
    ]
    const result = groupConversations(logs, customers)
    expect(result[0].customerName).toBe('Awa')
    expect(result[0].phone).toBe('24177000001')
  })

  it('nom = téléphone formaté quand le client est absent', () => {
    const logs = [log('1', '24177000001@s.whatsapp.net', '2026-07-11T10:00:00Z')]
    const result = groupConversations(logs, [])
    expect(result[0].customerName).toBe('+241 77 00 00 01')
    expect(result[0].phone).toBeNull()
  })

  it('nom = téléphone formaté quand le client existe mais sans nom', () => {
    const logs = [log('1', '24177000001@s.whatsapp.net', '2026-07-11T10:00:00Z')]
    const customers: ConversationCustomer[] = [
      { chat_id: '24177000001@s.whatsapp.net', name: null, phone: '24177000001' },
    ]
    const result = groupConversations(logs, customers)
    expect(result[0].customerName).toBe('+241 77 00 00 01')
  })

  it('extrait tronqué à 80 caractères avec ellipse, fallback — si body vide', () => {
    const longBody = 'a'.repeat(120)
    const logs = [
      log('1', 'chatA', '2026-07-11T10:00:00Z', { body: longBody }),
      log('2', 'chatB', '2026-07-11T10:00:00Z', { body: null }),
      log('3', 'chatC', '2026-07-11T10:00:00Z', { body: 'court' }),
    ]
    const result = groupConversations(logs, [])
    const byId = Object.fromEntries(result.map((r) => [r.chatId, r]))
    expect(byId.chatA.lastBody).toBe(`${'a'.repeat(80)}…`)
    expect(byId.chatA.lastBody).toHaveLength(81)
    expect(byId.chatB.lastBody).toBe('—')
    expect(byId.chatC.lastBody).toBe('court')
  })

  it('lastDirection reflète le dernier message et unreadCandidate suit "in"', () => {
    const logs = [
      log('1', 'chatA', '2026-07-11T09:00:00Z', { direction: 'in' }),
      log('2', 'chatA', '2026-07-11T10:00:00Z', { direction: 'out' }),
    ]
    const result = groupConversations(logs, [])
    expect(result[0].lastDirection).toBe('out')
    expect(result[0].unreadCandidate).toBe(false)
  })

  it('logs vides → []', () => {
    expect(groupConversations([], [])).toEqual([])
  })
})

describe('threadFor', () => {
  it('renvoie les messages d’un chat triés par created_at croissant', () => {
    const logs = [
      log('1', 'chatA', '2026-07-11T10:00:00Z'),
      log('2', 'chatB', '2026-07-11T09:00:00Z'),
      log('3', 'chatA', '2026-07-11T08:00:00Z'),
    ]
    const result = threadFor(logs, 'chatA')
    expect(result.map((l) => l.id)).toEqual(['3', '1'])
  })

  it('chat inconnu → []', () => {
    expect(threadFor([log('1', 'chatA', '2026-07-11T10:00:00Z')], 'chatZ')).toEqual([])
  })
})
