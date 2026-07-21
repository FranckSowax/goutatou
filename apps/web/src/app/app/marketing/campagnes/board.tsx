'use client'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { badgeVariantForCampaign } from '@/lib/status-badge'
import { statusLabel } from '@/lib/campaigns'
import { useTableRefresh } from '@/lib/use-table-refresh'
import type { CampaignStatus } from '@goutatou/db/types'

interface Row { id: string; name: string; status: CampaignStatus; total_recipients: number; sent_count: number; failed_count: number }

export function Board({ initial }: { initial: Row[] }) {
  // L'envoi d'une campagne incrémente `sent_count` destinataire par destinataire : sans debounce,
  // c'était un rendu serveur complet par message envoyé.
  useTableRefresh({ channelName: 'campaigns', tables: ['campaigns'] })
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Campagnes WhatsApp</h1>
        <Button asChild>
          <Link href="/app/marketing/campagnes/nouvelle">Nouvelle campagne</Link>
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {initial.map((c) => (
          <li key={c.id}>
            <Link href={`/app/marketing/campagnes/${c.id}`} className="block">
              <Card className="rounded-2xl p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold">{c.name}</span>
                  <Badge variant={badgeVariantForCampaign(c.status)}>{statusLabel(c.status)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.sent_count}/{c.total_recipients} envoyés · {c.failed_count} échecs</p>
              </Card>
            </Link>
          </li>
        ))}
        {initial.length === 0 && <p className="text-muted-foreground">Aucune campagne pour l’instant.</p>}
      </ul>
    </div>
  )
}
