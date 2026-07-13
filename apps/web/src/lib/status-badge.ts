import type { OrderStatus, CampaignStatus, StatusState } from '@goutatou/db/types'

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'muted'

export function badgeVariantForOrder(s: OrderStatus): BadgeTone {
  return ({ recue: 'default', en_preparation: 'warning', prete: 'success', recuperee: 'muted', annulee: 'destructive' } as const)[s]
}
export function badgeVariantForCampaign(s: CampaignStatus): BadgeTone {
  return ({ draft: 'muted', scheduled: 'warning', sending: 'default', sent: 'success', canceled: 'destructive' } as const)[s]
}
export function badgeVariantForStatus(s: StatusState): BadgeTone {
  return ({
    draft: 'muted', scheduled: 'warning', posting: 'default', posted: 'success',
    failed: 'destructive', canceled: 'muted', pending_approval: 'warning',
  } as const)[s]
}
