import { describe, expect, it } from 'vitest'
import { APPROVAL_COPY, isManagerSender, parseApprovalButton } from '../src/autostatus/approval.js'

describe('parseApprovalButton', () => {
  it('stapp:<id> → action approve', () => {
    expect(parseApprovalButton('stapp:abc-123')).toEqual({ action: 'approve', statusId: 'abc-123' })
  })

  it('strej:<id> → action reject', () => {
    expect(parseApprovalButton('strej:abc-123')).toEqual({ action: 'reject', statusId: 'abc-123' })
  })

  it('streg:<id> → action regen', () => {
    expect(parseApprovalButton('streg:abc-123')).toEqual({ action: 'regen', statusId: 'abc-123' })
  })

  it('stcan:<id> → action cancel', () => {
    expect(parseApprovalButton('stcan:abc-123')).toEqual({ action: 'cancel', statusId: 'abc-123' })
  })

  it('id sans préfixe connu → null', () => {
    expect(parseApprovalButton('in:1')).toBeNull()
    expect(parseApprovalButton('unrelated-id')).toBeNull()
    expect(parseApprovalButton('')).toBeNull()
  })

  it('préfixe connu mais statusId vide → null', () => {
    expect(parseApprovalButton('stapp:')).toBeNull()
  })

  it('id contenant un préfixe connu ailleurs qu’au début → null', () => {
    expect(parseApprovalButton('xstapp:abc')).toBeNull()
  })

  it('statusId contenant lui-même deux-points → conservé tel quel après le préfixe', () => {
    expect(parseApprovalButton('stapp:uuid:with:colons')).toEqual({
      action: 'approve', statusId: 'uuid:with:colons',
    })
  })
})

describe('APPROVAL_COPY', () => {
  it('copies FR figées attendues par le brief', () => {
    expect(APPROVAL_COPY.notAvailable).toBe("Cette validation n'est plus disponible.")
    expect(APPROVAL_COPY.alreadyHandled).toBe('Ce statut a déjà été traité.')
    expect(APPROVAL_COPY.approved).toBe("✅ Statut validé — publication à l'heure prévue.")
    expect(APPROVAL_COPY.rejectPrompt).toBe('Que souhaitez-vous faire ?')
    expect(APPROVAL_COPY.canceled).toBe('🚫 Statut annulé.')
    expect(APPROVAL_COPY.cancelError).toBe('Refusé par le gérant.')
  })
})

describe('isManagerSender', () => {
  it('numéro gérant correspondant (avec/sans indicatif, suffixe @s.whatsapp.net) → true', () => {
    expect(isManagerSender('24106871309@s.whatsapp.net', '24106871309')).toBe(true)
    expect(isManagerSender('24106871309@s.whatsapp.net', '+241 06 87 13 09')).toBe(true)
    expect(isManagerSender('24106871309@s.whatsapp.net', '06871309')).toBe(true) // suffixe sans indicatif
  })
  it('numéro différent → false (un autre contact ne peut pas valider)', () => {
    expect(isManagerSender('24177001003@s.whatsapp.net', '24106871309')).toBe(false)
  })
  it('managerPhone null/vide → true (pas de verrou, gardes portée+UUID)', () => {
    expect(isManagerSender('24106871309@s.whatsapp.net', null)).toBe(true)
    expect(isManagerSender('24106871309@s.whatsapp.net', '')).toBe(true)
  })
})
