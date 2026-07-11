'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setHeroMedia } from './actions'

const MAX_MB = 60

/**
 * Upload direct navigateur → bucket lp-media (session admin, policies RLS),
 * puis enregistrement du chemin via la server action. Les fichiers vidéo
 * dépassent la limite de corps des Server Actions : ne JAMAIS repasser
 * par un upload via action.
 */
export function HeroUpload({ restaurantId }: { restaurantId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function upload() {
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      setMessage(`Fichier trop lourd (max ${MAX_MB} Mo).`)
      return
    }
    setPending(true)
    setMessage(null)
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${restaurantId}/hero-${Date.now()}-${safeName}`
      const { error } = await supabase.storage
        .from('lp-media')
        .upload(path, file, { contentType: file.type || undefined })
      if (error) throw new Error(error.message)
      await setHeroMedia(restaurantId, path)
      setMessage('Média hero enregistré.')
      setFile(null)
      router.refresh()
    } catch {
      setMessage("L'upload a échoué. Réessayez.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept="image/*,video/*"
          className="w-auto"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMessage(null) }}
        />
        <Button type="button" variant="outline" disabled={!file || pending} onClick={upload}>
          {pending ? 'Upload en cours…' : 'Uploader le média hero'}
        </Button>
      </div>
      {file && !pending && (
        <p className="text-xs text-muted-foreground">
          {file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo
        </p>
      )}
      {message && <p className="text-xs font-medium text-foreground">{message}</p>}
    </div>
  )
}
