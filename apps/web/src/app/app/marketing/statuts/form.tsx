'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StatusKind } from '@goutatou/db/types'
import { createStatus, uploadStatusMedia } from './actions'

export function StatusForm() {
  const [kind, setKind] = useState<StatusKind>('text')
  const [mediaUrl, setMediaUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduleError, setScheduleError] = useState(false)

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.set('media', file)
    try { setMediaUrl(await uploadStatusMedia(fd)) } finally { setUploading(false) }
  }

  function onScheduleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!scheduledAt.trim()) {
      e.preventDefault()
      setScheduleError(true)
    }
  }

  return (
    <form action={createStatus} className="flex flex-col gap-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as StatusKind)}>
        <TabsList>
          <TabsTrigger value="text">Texte</TabsTrigger>
          <TabsTrigger value="image">Image</TabsTrigger>
        </TabsList>
      </Tabs>
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status-content">Contenu</Label>
        <Textarea id="status-content" name="content" required rows={4} placeholder="Votre statut…" />
      </div>
      <input type="hidden" name="media_url" value={mediaUrl} />
      {kind === 'image' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-media">Image</Label>
          <Input id="status-media" type="file" accept="image/*" onChange={onUpload} />
          {uploading && <p className="text-sm text-muted-foreground">Upload…</p>}
          {mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="mt-1 max-h-40 rounded-lg object-cover" />
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status-scheduled-at">Programmer (optionnel)</Label>
        <Input
          id="status-scheduled-at"
          type="datetime-local"
          name="scheduled_at"
          value={scheduledAt}
          onChange={(e) => { setScheduledAt(e.target.value); if (e.target.value.trim()) setScheduleError(false) }}
        />
      </div>
      {scheduleError && (
        <p className="text-sm text-destructive">Choisissez une date et une heure.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="now">Publier maintenant</Button>
        <Button type="submit" name="action" value="schedule" variant="outline" onClick={onScheduleClick}>Programmer</Button>
        <Button type="submit" name="action" value="draft" variant="ghost">Brouillon</Button>
      </div>
    </form>
  )
}
