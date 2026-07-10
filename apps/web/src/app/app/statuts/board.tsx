'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { statusStateLabel } from '@goutatou/db/types'
import type { StatusState, StatusKind } from '@goutatou/db/types'
import { cancelStatus } from './actions'
import { StatusForm } from './form'

interface Row {
  id: string
  kind: StatusKind
  content: string
  media_url: string | null
  state: StatusState
  scheduled_at: string | null
  created_at: string
}

export function Board({ initial }: { initial: Row[] }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const ch = supabase.channel('statuses').on('postgres_changes',
      { event: '*', schema: 'public', table: 'statuses' }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [router])
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Statuts WhatsApp</h1>
      <div className="mb-8 rounded-lg bg-white p-4 shadow-xs">
        <h2 className="mb-3 text-lg font-semibold">Nouveau statut</h2>
        <StatusForm />
      </div>
      <ul className="flex flex-col gap-3">
        {initial.map((s) => (
          <li key={s.id} className="rounded-lg bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{s.kind === 'image' ? 'Image' : 'Texte'}</span>
              <span className="text-sm opacity-60">{statusStateLabel(s.state)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{s.content}</p>
            {s.media_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.media_url} alt="" className="mt-2 max-h-40 rounded-sm" />
            )}
            {s.scheduled_at && (
              <p className="mt-1 text-sm opacity-60">Programmé : {new Date(s.scheduled_at).toLocaleString('fr-FR')}</p>
            )}
            {(s.state === 'scheduled' || s.state === 'posting') && (
              <form action={cancelStatus.bind(null, s.id)} className="mt-2">
                <button className="rounded-sm border border-red-300 px-3 py-1 text-sm text-red-600">Annuler</button>
              </form>
            )}
          </li>
        ))}
        {initial.length === 0 && <p className="opacity-60">Aucun statut pour l’instant.</p>}
      </ul>
    </div>
  )
}
