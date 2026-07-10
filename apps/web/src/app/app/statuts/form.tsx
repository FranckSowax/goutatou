'use client'
import { useState } from 'react'
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
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name="kind" value="text" checked={kind === 'text'} onChange={() => setKind('text')} /> Texte
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="kind" value="image" checked={kind === 'image'} onChange={() => setKind('image')} /> Image
        </label>
      </div>
      <textarea name="content" required rows={4} placeholder="Votre statut…" className="rounded-sm border p-2" />
      <input type="hidden" name="media_url" value={mediaUrl} />
      {kind === 'image' && (
        <>
          <label className="text-sm">Image
            <input type="file" accept="image/*" onChange={onUpload} className="mt-1 block text-sm" />
          </label>
          {uploading && <p className="text-sm opacity-60">Upload…</p>}
          {mediaUrl && <p className="text-sm text-green-700">Image jointe ✓</p>}
        </>
      )}
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
        <p className="text-sm text-red-600">Choisissez une date et une heure.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button name="action" value="now" className="rounded-sm bg-neutral-900 px-4 py-2 text-white">Publier maintenant</button>
        <button name="action" value="schedule" onClick={onScheduleClick} className="rounded-sm border px-4 py-2">Programmer</button>
        <button name="action" value="draft" className="rounded-sm border px-4 py-2">Brouillon</button>
      </div>
    </form>
  )
}
