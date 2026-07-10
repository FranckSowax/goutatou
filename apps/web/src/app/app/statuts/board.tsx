'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { statusStateLabel } from '@goutatou/db/types'
import type { StatusState, StatusKind } from '@goutatou/db/types'
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
import { badgeVariantForStatus } from '@/lib/status-badge'
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
      <h1 className="mb-6 font-display text-2xl font-semibold">Statuts WhatsApp</h1>
      <Card className="mb-8 rounded-2xl p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Nouveau statut</h2>
        <StatusForm />
      </Card>
      <ul className="flex flex-col gap-3">
        {initial.map((s) => (
          <li key={s.id}>
            <Card className="rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold">{s.kind === 'image' ? 'Image' : 'Texte'}</span>
                <Badge variant={badgeVariantForStatus(s.state)}>{statusStateLabel(s.state)}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.content}</p>
              {s.media_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.media_url} alt="" className="mt-2 max-h-40 rounded-lg object-cover" />
              )}
              {s.scheduled_at && (
                <p className="mt-2 text-sm text-muted-foreground">Programmé : {new Date(s.scheduled_at).toLocaleString('fr-FR')}</p>
              )}
              {(s.state === 'scheduled' || s.state === 'posting') && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="destructive" size="sm" className="mt-2">
                      Annuler
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Annuler ce statut ?</DialogTitle>
                      <DialogDescription>
                        Ce statut ne sera pas publié sur WhatsApp. Cette action est irréversible.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          Retour
                        </Button>
                      </DialogClose>
                      <form action={cancelStatus.bind(null, s.id)}>
                        <Button type="submit" variant="destructive">
                          Annuler le statut
                        </Button>
                      </form>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </Card>
          </li>
        ))}
        {initial.length === 0 && <p className="text-muted-foreground">Aucun statut pour l’instant.</p>}
      </ul>
    </div>
  )
}
