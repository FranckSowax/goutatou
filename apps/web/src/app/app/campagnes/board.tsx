'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
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
        <h1 className="text-2xl font-bold">Campagnes WhatsApp</h1>
        <Link href="/app/campagnes/nouvelle" className="rounded-sm bg-neutral-900 px-4 py-2 text-sm text-white">Nouvelle campagne</Link>
      </div>
      <ul className="flex flex-col gap-3">
        {initial.map((c) => (
          <li key={c.id}>
            <Link href={`/app/campagnes/${c.id}`} className="block rounded-lg bg-white p-4 shadow-xs">
              <div className="flex justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm opacity-60">{statusLabel(c.status)}</span>
              </div>
              <p className="mt-1 text-sm opacity-60">{c.sent_count}/{c.total_recipients} envoyés · {c.failed_count} échecs</p>
            </Link>
          </li>
        ))}
        {initial.length === 0 && <p className="opacity-60">Aucune campagne pour l’instant.</p>}
      </ul>
    </div>
  )
}
