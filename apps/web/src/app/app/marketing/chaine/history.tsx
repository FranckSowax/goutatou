import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChannelHistoryEntry } from './channel-data'

/** Historique des derniers posts de la chaîne — lecture seule. */
export function History({ entries }: { entries: ChannelHistoryEntry[] }) {
  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Historique</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun post pour le moment.</p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="text-foreground">{entry.preview}</p>
                {entry.date && <p className="mt-0.5 text-xs text-muted-foreground">{entry.date}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
