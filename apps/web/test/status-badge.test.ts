import { describe, expect, it } from 'vitest'
import { badgeVariantForOrder, badgeVariantForCampaign, badgeVariantForStatus } from '../src/lib/status-badge'

describe('status-badge mapping', () => {
  it('commandes', () => {
    expect(badgeVariantForOrder('recue')).toBe('default')
    expect(badgeVariantForOrder('en_preparation')).toBe('warning')
    expect(badgeVariantForOrder('prete')).toBe('success')
    expect(badgeVariantForOrder('recuperee')).toBe('muted')
    expect(badgeVariantForOrder('annulee')).toBe('destructive')
  })
  it('campagnes', () => {
    expect(badgeVariantForCampaign('sent')).toBe('success')
    expect(badgeVariantForCampaign('scheduled')).toBe('warning')
    expect(badgeVariantForCampaign('canceled')).toBe('destructive')
  })
  it('statuts', () => {
    expect(badgeVariantForStatus('posted')).toBe('success')
    expect(badgeVariantForStatus('failed')).toBe('destructive')
  })
})
