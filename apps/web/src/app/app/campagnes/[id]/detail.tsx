'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { campaignProgress, type CampaignStatus } from '@goutatou/db/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { badgeVariantForCampaign } from '@/lib/status-badge'
import { canCancel, statusLabel } from '@/lib/campaigns'
import { cancelCampaign } from '../actions'

interface C { id: string; name: string; body: string; status: CampaignStatus; total_recipients: number; sent_count: number; failed_count: number }

export function CampaignDetail({ c }: { c: C }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel(`campaign-${c.id}`).on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${c.id}` }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [c.id, router])
  const p = campaignProgress(c.total_recipients, c.sent_count, c.failed_count)
  return (
    <main className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{c.name}</h1>
        <Badge variant={badgeVariantForCampaign(c.status)}>{statusLabel(c.status)}</Badge>
      </div>
      <Card className="mb-6 p-4">
        <p className="whitespace-pre-wrap text-sm">{c.body}</p>
      </Card>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Card className="p-3"><p className="text-2xl font-bold">{p.sent}</p><p className="text-xs text-muted-foreground">Envoyés</p></Card>
        <Card className="p-3"><p className="text-2xl font-bold">{p.pending}</p><p className="text-xs text-muted-foreground">En attente</p></Card>
        <Card className="p-3"><p className="text-2xl font-bold text-destructive">{p.failed}</p><p className="text-xs text-muted-foreground">Échecs</p></Card>
      </div>
      {canCancel(c.status) && (
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" className="mt-6">
              Annuler la campagne
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Annuler cette campagne ?</DialogTitle>
              <DialogDescription>
                « {c.name} » ne sera plus envoyée aux destinataires restants. Cette action est irréversible.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Retour
                </Button>
              </DialogClose>
              <form action={cancelCampaign.bind(null, c.id)}>
                <Button type="submit" variant="destructive">
                  Annuler la campagne
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  )
}
