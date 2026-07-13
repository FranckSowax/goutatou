import { describe, expect, it } from 'vitest'
import { CHANNEL_APPROVAL_COPY, parseChannelApprovalButton } from '../src/autochannel/approval.js'

describe('parseChannelApprovalButton', () => {
  it('chapp:<id> → action approve', () => {
    expect(parseChannelApprovalButton('chapp:abc-123')).toEqual({ action: 'approve', postId: 'abc-123' })
  })

  it('chrej:<id> → action reject', () => {
    expect(parseChannelApprovalButton('chrej:abc-123')).toEqual({ action: 'reject', postId: 'abc-123' })
  })

  it('chreg:<id> → action regen', () => {
    expect(parseChannelApprovalButton('chreg:abc-123')).toEqual({ action: 'regen', postId: 'abc-123' })
  })

  it('chcan:<id> → action cancel', () => {
    expect(parseChannelApprovalButton('chcan:abc-123')).toEqual({ action: 'cancel', postId: 'abc-123' })
  })

  it('id sans préfixe connu → null', () => {
    expect(parseChannelApprovalButton('in:1')).toBeNull()
    expect(parseChannelApprovalButton('unrelated-id')).toBeNull()
    expect(parseChannelApprovalButton('')).toBeNull()
  })

  it('préfixe connu mais postId vide → null', () => {
    expect(parseChannelApprovalButton('chapp:')).toBeNull()
  })

  it('id contenant un préfixe connu ailleurs qu’au début → null', () => {
    expect(parseChannelApprovalButton('xchapp:abc')).toBeNull()
  })

  it('ne confond pas avec les préfixes de statuts (stapp:/strej:/streg:/stcan:)', () => {
    expect(parseChannelApprovalButton('stapp:abc')).toBeNull()
    expect(parseChannelApprovalButton('strej:abc')).toBeNull()
    expect(parseChannelApprovalButton('streg:abc')).toBeNull()
    expect(parseChannelApprovalButton('stcan:abc')).toBeNull()
  })
})

describe('CHANNEL_APPROVAL_COPY', () => {
  it('copies FR figées attendues par le brief (parallèles à APPROVAL_COPY, adaptées post chaîne)', () => {
    expect(CHANNEL_APPROVAL_COPY.notAvailable).toBe("Cette validation n'est plus disponible.")
    expect(CHANNEL_APPROVAL_COPY.alreadyHandled).toBe('Ce post chaîne a déjà été traité.')
    expect(CHANNEL_APPROVAL_COPY.approved).toBe("✅ Post chaîne validé — publication à l'heure prévue.")
    expect(CHANNEL_APPROVAL_COPY.rejectPrompt).toBe('Que souhaitez-vous faire ?')
    expect(CHANNEL_APPROVAL_COPY.regenerateTitle).toBe('🔄 Régénérer')
    expect(CHANNEL_APPROVAL_COPY.cancelTitle).toBe('🚫 Annuler')
    expect(CHANNEL_APPROVAL_COPY.canceled).toBe('🚫 Post chaîne annulé.')
    expect(CHANNEL_APPROVAL_COPY.cancelError).toBe('Refusé par le gérant.')
    expect(CHANNEL_APPROVAL_COPY.reapprovePrompt).toBe('Publier ce post chaîne ?')
    expect(CHANNEL_APPROVAL_COPY.validateTitle).toBe('✅ Valider')
    expect(CHANNEL_APPROVAL_COPY.refuseTitle).toBe('❌ Refuser')
    expect(CHANNEL_APPROVAL_COPY.noDishToRegenerate).toBe('Aucun autre plat disponible avec photo pour régénérer.')
  })
})
