import { describe, it, expect } from 'vitest'
import { anonymizeText, anonymizeMessages, MAX_CHARS } from '../src/analysis/anonymize.js'
import { duePeriods, periodBoundsUtc, addDays, weekdayMon0 } from '../src/analysis/periods.js'
import { buildAnalysisPrompt } from '../src/analysis/prompt.js'
import { parseInsights } from '../src/analysis/mistral.js'

describe('anonymizeText', () => {
  it('retire les numéros de téléphone', () => {
    expect(anonymizeText('Appelle-moi au 077 12 34 56')).toBe('Appelle-moi au [numéro]')
    expect(anonymizeText('mon numero 24177000001')).toBe('mon numero [numéro]')
  })
  it('retire les jid WhatsApp et uuid', () => {
    expect(anonymizeText('client 24177000001@s.whatsapp.net')).toContain('[numéro]')
    expect(anonymizeText('id 550e8400-e29b-41d4-a716-446655440000 ok')).toBe('id [id] ok')
  })
  it('laisse un prix court intact', () => {
    expect(anonymizeText('ça coûte 3500 FCFA')).toBe('ça coûte 3500 FCFA')
  })
})

describe('anonymizeMessages', () => {
  it('mappe les rôles et ignore les corps vides', () => {
    const { messages } = anonymizeMessages([
      { direction: 'in', body: 'Bonjour' },
      { direction: 'out', body: '  ' },
      { direction: 'out', body: 'Bienvenue' },
    ])
    expect(messages).toEqual([
      { role: 'client', text: 'Bonjour' },
      { role: 'bot', text: 'Bienvenue' },
    ])
  })
  it('tronque au budget en gardant les plus récents', () => {
    const long = 'a'.repeat(5000)
    const rows = Array.from({ length: 10 }, (_, i) => ({ direction: 'in' as const, body: `${i}-${long}` }))
    const { messages, truncated } = anonymizeMessages(rows)
    expect(truncated).toBe(true)
    // le tout dépasse MAX_CHARS → une partie est coupée, et le dernier message reste présent
    expect(messages.length).toBeLessThan(10)
    expect(messages[messages.length - 1].text.startsWith('9-')).toBe(true)
    expect(messages.reduce((s, m) => s + m.text.length, 0)).toBeLessThanOrEqual(MAX_CHARS)
  })
})

describe('periods', () => {
  it('addDays franchit un mois', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('weekdayMon0 : lundi = 0', () => {
    // 2026-07-13 est un lundi
    expect(weekdayMon0('2026-07-13')).toBe(0)
    expect(weekdayMon0('2026-07-19')).toBe(6) // dimanche
  })
  it('periodBoundsUtc borne un jour Libreville en UTC', () => {
    const { startUtc, endUtc } = periodBoundsUtc('2026-07-17', '2026-07-17')
    expect(startUtc).toBe('2026-07-16T23:00:00.000Z')
    expect(endUtc).toBe('2026-07-17T23:00:00.000Z')
  })
  it('duePeriods renvoie veille / semaine préc. / mois préc.', () => {
    // now = mercredi 2026-07-15 10:00 Libreville
    const periods = duePeriods(new Date('2026-07-15T09:00:00Z'))
    const day = periods.find((p) => p.type === 'day')!
    const week = periods.find((p) => p.type === 'week')!
    const month = periods.find((p) => p.type === 'month')!
    expect(day.start).toBe('2026-07-14')
    expect(day.end).toBe('2026-07-14')
    // semaine préc. = lun 06 → dim 12 juillet
    expect(week.start).toBe('2026-07-06')
    expect(week.end).toBe('2026-07-12')
    // mois préc. = juin
    expect(month.start).toBe('2026-06-01')
    expect(month.end).toBe('2026-06-30')
  })
})

describe('buildAnalysisPrompt', () => {
  it('demande du JSON FR avec le schéma et injecte les données', () => {
    const { system, user } = buildAnalysisPrompt(
      'la journée du 2026-07-14',
      [{ role: 'client', text: 'Vous avez du poulet ?' }],
      { orders: 3, revenue: 12000, conversations: 2 },
      false,
    )
    expect(system).toContain('JSON')
    expect(system).toContain('actions_marketing')
    expect(user).toContain('2026-07-14')
    expect(user).toContain('12000 FCFA')
    expect(user).toContain('[client] Vous avez du poulet ?')
  })
})

describe('parseInsights', () => {
  it('coerce un JSON valide en AiInsights', () => {
    const r = parseInsights(JSON.stringify({
      resume_executif: 'Bonne semaine',
      demandes: ['livraison le soir'],
      plats_preferes: ['Poulet DG'],
      demandes_non_satisfaites: ['pizza'],
      faq: [{ question: 'Horaires ?', reponse_suggeree: 'Ouvert 10h-22h' }],
      sentiment: { note: 8, resume: 'Satisfaits' },
      frictions: ['attente livraison'],
      actions_marketing: ['a', 'b', 'c', 'd'],
    }))
    expect(r.resume_executif).toBe('Bonne semaine')
    expect(r.demandes).toEqual(['livraison le soir'])
    expect(r.faq[0].question).toBe('Horaires ?')
    expect(r.sentiment.note).toBe(8)
    expect(r.actions_marketing).toHaveLength(3) // cappé à 3
  })
  it('renvoie des défauts vides sur JSON invalide', () => {
    const r = parseInsights('pas du json')
    expect(r.resume_executif).toBe('')
    expect(r.demandes).toEqual([])
    expect(r.sentiment.note).toBe(0)
  })
  it('tolère les champs manquants', () => {
    const r = parseInsights(JSON.stringify({ demandes: ['x'] }))
    expect(r.demandes).toEqual(['x'])
    expect(r.plats_preferes).toEqual([])
    expect(r.faq).toEqual([])
  })
})
