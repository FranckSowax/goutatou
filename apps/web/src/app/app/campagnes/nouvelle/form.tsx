'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createCampaign, uploadCampaignMedia } from '../actions'

export function CampaignForm({ recipientCount }: { recipientCount: number }) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduleError, setScheduleError] = useState(false)
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.set('media', file)
    try { setMediaUrl(await uploadCampaignMedia(fd)) } finally { setUploading(false) }
  }
  function onScheduleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!scheduledAt.trim()) {
      e.preventDefault()
      setScheduleError(true)
    }
  }
  return (
    <Card className="p-6">
      <form action={createCampaign} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-name">Nom de la campagne (interne)</Label>
          <Input id="campaign-name" name="name" required placeholder="Nom de la campagne (interne)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-body">Message</Label>
          <Textarea id="campaign-body" name="body" required rows={5} placeholder="Votre message…" />
        </div>
        <input type="hidden" name="media_url" value={mediaUrl} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-media">Image (optionnel)</Label>
          <Input id="campaign-media" type="file" accept="image/*" onChange={onUpload} />
        </div>
        {uploading && <p className="text-sm text-muted-foreground">Upload…</p>}
        {mediaUrl && <p className="text-sm text-success">Image jointe ✓</p>}
        <p className="text-sm text-muted-foreground">Destinataires (clients opt-in) : <strong>{recipientCount}</strong></p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-scheduled-at">Programmer (optionnel)</Label>
          <Input
            id="campaign-scheduled-at"
            type="datetime-local"
            name="scheduled_at"
            value={scheduledAt}
            onChange={(e) => { setScheduledAt(e.target.value); if (e.target.value.trim()) setScheduleError(false) }}
          />
        </div>
        {scheduleError && (
          <p className="text-sm text-destructive">Choisissez une date et une heure d’envoi pour programmer la campagne.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="action" value="now">Envoyer maintenant</Button>
          <Button type="submit" name="action" value="schedule" variant="outline" onClick={onScheduleClick}>Programmer</Button>
          <Button type="submit" name="action" value="draft" variant="ghost">Brouillon</Button>
        </div>
        <p className="text-xs text-muted-foreground">Les messages partent progressivement (anti-blocage WhatsApp). Les clients désabonnés (STOP) sont automatiquement exclus.</p>
      </form>
    </Card>
  )
}
