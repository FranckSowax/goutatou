'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { campaignProgress, type CampaignStatus } from '@goutatou/db/types'
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <span className="text-sm opacity-60">{statusLabel(c.status)}</span>
      </div>
      <p className="mb-6 whitespace-pre-wrap rounded-lg bg-white p-4 text-sm shadow-xs">{c.body}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-white p-3 shadow-xs"><p className="text-2xl font-bold">{p.sent}</p><p className="text-xs opacity-60">Envoyés</p></div>
        <div className="rounded-lg bg-white p-3 shadow-xs"><p className="text-2xl font-bold">{p.pending}</p><p className="text-xs opacity-60">En attente</p></div>
        <div className="rounded-lg bg-white p-3 shadow-xs"><p className="text-2xl font-bold text-red-600">{p.failed}</p><p className="text-xs opacity-60">Échecs</p></div>
      </div>
      {canCancel(c.status) && (
        <form action={cancelCampaign.bind(null, c.id)} className="mt-6">
          <button className="rounded-sm border border-red-300 px-4 py-2 text-sm text-red-600">Annuler la campagne</button>
        </form>
      )}
    </main>
  )
}
