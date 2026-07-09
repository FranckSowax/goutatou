'use client'
import { useState } from 'react'
import { createCampaign, uploadCampaignMedia } from '../actions'

export function CampaignForm({ recipientCount }: { recipientCount: number }) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.set('media', file)
    try { setMediaUrl(await uploadCampaignMedia(fd)) } finally { setUploading(false) }
  }
  return (
    <form action={createCampaign} className="flex flex-col gap-4">
      <input name="name" required placeholder="Nom de la campagne (interne)" className="rounded border p-2" />
      <textarea name="body" required rows={5} placeholder="Votre message…" className="rounded border p-2" />
      <input type="hidden" name="media_url" value={mediaUrl} />
      <label className="text-sm">Image (optionnel)
        <input type="file" accept="image/*" onChange={onUpload} className="mt-1 block text-sm" />
      </label>
      {uploading && <p className="text-sm opacity-60">Upload…</p>}
      {mediaUrl && <p className="text-sm text-green-700">Image jointe ✓</p>}
      <p className="text-sm opacity-70">Destinataires (clients opt-in) : <strong>{recipientCount}</strong></p>
      <label className="text-sm">Programmer (optionnel)
        <input type="datetime-local" name="scheduled_at" className="mt-1 block rounded border p-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button name="action" value="now" className="rounded bg-neutral-900 px-4 py-2 text-white">Envoyer maintenant</button>
        <button name="action" value="schedule" className="rounded border px-4 py-2">Programmer</button>
        <button name="action" value="draft" className="rounded border px-4 py-2">Brouillon</button>
      </div>
      <p className="text-xs opacity-50">Les messages partent progressivement (anti-blocage WhatsApp). Les clients désabonnés (STOP) sont automatiquement exclus.</p>
    </form>
  )
}
