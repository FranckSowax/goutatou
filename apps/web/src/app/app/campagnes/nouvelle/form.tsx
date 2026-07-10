'use client'
import { useState } from 'react'
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
    <form action={createCampaign} className="flex flex-col gap-4">
      <input name="name" required placeholder="Nom de la campagne (interne)" className="rounded-sm border p-2" />
      <textarea name="body" required rows={5} placeholder="Votre message…" className="rounded-sm border p-2" />
      <input type="hidden" name="media_url" value={mediaUrl} />
      <label className="text-sm">Image (optionnel)
        <input type="file" accept="image/*" onChange={onUpload} className="mt-1 block text-sm" />
      </label>
      {uploading && <p className="text-sm opacity-60">Upload…</p>}
      {mediaUrl && <p className="text-sm text-green-700">Image jointe ✓</p>}
      <p className="text-sm opacity-70">Destinataires (clients opt-in) : <strong>{recipientCount}</strong></p>
      <label className="text-sm">Programmer (optionnel)
        <input
          type="datetime-local"
          name="scheduled_at"
          value={scheduledAt}
          onChange={(e) => { setScheduledAt(e.target.value); if (e.target.value.trim()) setScheduleError(false) }}
          className="mt-1 block rounded-sm border p-2"
        />
      </label>
      {scheduleError && (
        <p className="text-sm text-red-600">Choisissez une date et une heure d’envoi pour programmer la campagne.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button name="action" value="now" className="rounded-sm bg-neutral-900 px-4 py-2 text-white">Envoyer maintenant</button>
        <button name="action" value="schedule" onClick={onScheduleClick} className="rounded-sm border px-4 py-2">Programmer</button>
        <button name="action" value="draft" className="rounded-sm border px-4 py-2">Brouillon</button>
      </div>
      <p className="text-xs opacity-50">Les messages partent progressivement (anti-blocage WhatsApp). Les clients désabonnés (STOP) sont automatiquement exclus.</p>
    </form>
  )
}
