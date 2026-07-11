'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { badgeVariantForCampaign } from '@/lib/status-badge'
import { statusLabel } from '@/lib/campaigns'
import type { CampaignStatus } from '@goutatou/db/types'

interface Row { id: string; name: string; status: CampaignStatus; total_recipients: number; sent_count: number; failed_count: number }

export function Board({ initial }: { initial: Row[] }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel('campaigns').on('postgres_changes',
      { event: '*', schema: 'public', table: 'campaigns' }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [router])
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
