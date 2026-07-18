import { describe, expect, it } from 'vitest'
import { paymentBadge, paymentTicketLine } from '../src/lib/payment'

describe('paymentBadge', () => {
  it('airtel + a_verifier → badge ambre « à vérifier »', () => {
    expect(paymentBadge('airtel', 'a_verifier')).toEqual({
      label: '📱 Airtel — à vérifier',
      tone: 'pending',
    })
  })

  it('airtel + paye → badge confirmé', () => {
    expect(paymentBadge('airtel', 'paye')).toEqual({ label: '📱 Airtel ✓', tone: 'paid' })
  })

  it('cash → badge discret « à la remise » quel que soit le statut', () => {
    expect(paymentBadge('cash', 'na')).toEqual({ label: '💵 À la remise', tone: 'cash' })
  })

  it('méthode absente (commande historique) → null, aucun badge', () => {
    expect(paymentBadge(null, 'na')).toBeNull()
  })
})

describe('paymentTicketLine', () => {
  it('airtel payé avec référence → ligne complète', () => {
    expect(paymentTicketLine('airtel', 'paye', 'MP240718.1234')).toBe(
      'Paiement : Airtel ✓ · réf MP240718.1234',
    )
  })

  it('airtel à vérifier sans référence → pas de réf', () => {
    expect(paymentTicketLine('airtel', 'a_verifier', null)).toBe('Paiement : Airtel (à vérifier)')
  })

  it('cash → à la remise', () => {
    expect(paymentTicketLine('cash', 'na', null)).toBe('Paiement : à la remise')
  })

  it('méthode absente → null (ligne omise)', () => {
    expect(paymentTicketLine(null, 'na', null)).toBeNull()
  })
})
