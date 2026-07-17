'use client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cancelScheduledPost } from './actions'
import type { ChannelPostType } from './shared'

export interface ScheduledListPost {
  id: string
  kind: ChannelPostType
  content: string
  scheduled_at: string
}

const KIND_LABEL: Record<ChannelPostType, string> = {
  text: 'Texte',
  image: 'Photo',
  video: 'Vidéo',
  menu_card: 'Carte menu',
  poll: 'Sondage',
}

const PREVIEW_MAX_CHARS = 80

function preview(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return '(sans texte)'
  return trimmed.length > PREVIEW_MAX_CHARS ? `${trimmed.slice(0, PREVIEW_MAX_CHARS)}…` : trimmed
}

/**
 * Liste des posts chaîne programmés à venir (state 'scheduled'), avec
 * annulation. Ce composant est `'use client'` et importe directement
 * `cancelScheduledPost` (jamais de fonction reçue en prop d'un Server
 * Component — cf. Global Constraints).
 */
export function ScheduledList({ posts }: { posts: ScheduledListPost[] }) {
  return (
    <Card className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 font-display text-base font-semibold">Posts programmés</h2>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun post programmé pour le moment.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {KIND_LABEL[post.kind]} · {new Date(post.scheduled_at).toLocaleString('fr-FR')}
                </p>
                <p className="truncate text-sm text-muted-foreground">{preview(post.content)}</p>
              </div>
              <form action={cancelScheduledPost}>
                <input type="hidden" name="post_id" value={post.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Annuler
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
