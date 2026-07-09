import type { CampaignStatus } from '@goutatou/db/types'

const LABELS: Record<CampaignStatus, string> = {
  draft: 'Brouillon', scheduled: 'Programmée', sending: 'Envoi en cours', sent: 'Envoyée', canceled: 'Annulée',
}
export function statusLabel(s: CampaignStatus): string { return LABELS[s] }
export function canCancel(s: CampaignStatus): boolean { return s === 'scheduled' || s === 'sending' }
