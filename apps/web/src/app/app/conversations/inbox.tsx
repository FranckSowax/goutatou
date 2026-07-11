'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildWaLink } from '@/lib/lp/wa'
import {
  formatPhoneDisplay,
  groupConversations,
  threadFor,
  type ConversationCustomer,
  type ConversationLog,
} from '@/lib/conversations'

const SEEN_KEY = 'gtt-conv-seen'

function readSeenMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeSeenMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(map))
  } catch {
    /* quota dépassé ou navigation privée : on ignore, non bloquant */
  }
}

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH} h`
  const diffJ = Math.floor(diffH / 24)
  if (diffJ < 7) return `il y a ${diffJ} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Africa/Libreville' })
}

function heureCourte(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville',
  })
}

export function Inbox({ initialLogs, customers, restaurantId }: {
  initialLogs: ConversationLog[]
  customers: ConversationCustomer[]
  restaurantId: string | null
}) {
  const [logs, setLogs] = useState(initialLogs)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [seenMap, setSeenMap] = useState<Record<string, string>>({})
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setSeenMap(readSeenMap())
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel(`conversations-${restaurantId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_logs',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, (payload) => {
        const row = payload.new as ConversationLog
        setLogs((prev) => (prev.some((l) => l.id === row.id) ? prev : [row, ...prev]))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [restaurantId])

  const summaries = useMemo(() => groupConversations(logs, customers), [logs, customers])
  const selected = summaries.find((s) => s.chatId === selectedChatId) ?? null
  const thread = useMemo(
    () => (selectedChatId ? threadFor(logs, selectedChatId) : []),
    [logs, selectedChatId],
  )

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedChatId, thread.length])

  function openThread(chatId: string) {
    setSelectedChatId(chatId)
    setSeenMap((prev) => {
      const next = { ...prev, [chatId]: new Date().toISOString() }
      writeSeenMap(next)
      return next
    })
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-24 text-center">
        <MessagesSquare className="size-8 text-muted-foreground/50" />
        <p className="text-muted-foreground">Aucune conversation — les échanges du bot apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:h-[calc(100vh-14rem)] md:grid-cols-[20rem_1fr]">
      {/* Liste des conversations */}
      <div className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border bg-card',
        selectedChatId && 'hidden md:flex',
      )}>
        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {summaries.map((s) => {
            const seenAt = seenMap[s.chatId]
            const unread = s.unreadCandidate && (!seenAt || new Date(s.lastAt) > new Date(seenAt))
            const active = s.chatId === selectedChatId
            return (
              <button
                key={s.chatId}
                type="button"
                onClick={() => openThread(s.chatId)}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                  active && 'bg-accent/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{s.customerName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(s.lastAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted-foreground">{s.lastBody}</span>
                  {unread && <span aria-label="Non lu" className="size-2 shrink-0 rounded-full bg-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Fil de la conversation */}
      <div className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border bg-card',
        !selectedChatId && 'hidden md:flex',
      )}>
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Retour à la liste"
                  onClick={() => setSelectedChatId(null)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate font-medium">{selected.customerName}</p>
                  {selected.phone && (
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {formatPhoneDisplay(selected.phone)}
                    </p>
                  )}
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <a
                  href={buildWaLink(selected.phone ?? selected.chatId.split('@')[0])}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir dans WhatsApp
                </a>
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {thread.map((m) => (
                <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'flex max-w-[80%] flex-col gap-1 rounded-2xl px-3.5 py-2.5 text-sm',
                    m.direction === 'out'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card',
                  )}>
                    <p className="whitespace-pre-wrap break-words">{m.body ?? '—'}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-xs',
                        m.direction === 'out' ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}>
                        {heureCourte(m.created_at)}
                      </span>
                      {m.error && <Badge variant="destructive">Non délivré</Badge>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
            Sélectionnez une conversation pour afficher le fil.
          </div>
        )}
      </div>
    </div>
  )
}
