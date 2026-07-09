import { describe, expect, it } from 'vitest'
import { canCancel, statusLabel } from '../src/lib/campaigns'

describe('campaigns helpers', () => {
  it('statusLabel FR pour chaque statut', () => {
    expect(statusLabel('draft')).toBe('Brouillon')
    expect(statusLabel('sending')).toBe('Envoi en cours')
    expect(statusLabel('sent')).toBe('Envoyée')
  })
  it('canCancel seulement scheduled/sending', () => {
    expect(canCancel('scheduled')).toBe(true)
    expect(canCancel('sending')).toBe(true)
    expect(canCancel('draft')).toBe(false)
    expect(canCancel('sent')).toBe(false)
  })
})
