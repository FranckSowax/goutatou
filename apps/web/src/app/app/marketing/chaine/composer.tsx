'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  postChannelCatalog,
  postChannelImage,
  postChannelPoll,
  postChannelText,
  postChannelVideo,
  uploadChannelImage,
} from './actions'
import { MAX_VIDEO_MB, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, type ChannelPostType } from './shared'

const TYPE_LABELS: Record<ChannelPostType, string> = {
  text: 'Texte',
  image: 'Photo',
  video: 'Vidéo',
  album: 'Album',
  poll: 'Sondage',
}

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe le plus
  // pertinent, sauf pour nos propres Error() qui portent un message FR.
  if (_e instanceof Error && _e.message && !/^An error occurred/i.test(_e.message)) return _e.message
  return fallback
}

export function Composer({ restaurantId }: { restaurantId: string }) {
  const [type, setType] = useState<ChannelPostType>('text')

  // Texte
  const [body, setBody] = useState('')

  // Photo
  const [imageUrl, setImageUrl] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [imageUploading, setImageUploading] = useState(false)

  // Vidéo
  const [videoPath, setVideoPath] = useState('')
  const [videoCaption, setVideoCaption] = useState('')
  const [videoUploading, setVideoUploading] = useState(false)

  // Sondage
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function resetForm() {
    setBody('')
    setImageUrl('')
    setImageCaption('')
    setVideoPath('')
    setVideoCaption('')
    setQuestion('')
    setOptions(['', ''])
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  function addOption() {
    setOptions((prev) => (prev.length >= POLL_MAX_OPTIONS ? prev : [...prev, '']))
  }

  function removeOption(idx: number) {
    setOptions((prev) => (prev.length <= POLL_MIN_OPTIONS ? prev : prev.filter((_, i) => i !== idx)))
  }

  async function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('media', file)
      const url = await uploadChannelImage(fd)
      setImageUrl(url)
    } catch (err) {
      setError(errorMessage(err, "L'upload de l'image a échoué. Réessayez."))
    } finally {
      setImageUploading(false)
    }
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'video/mp4' && !/\.mp4$/i.test(file.name)) {
      setError('La vidéo doit être au format mp4.')
      return
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Vidéo trop lourde (max ${MAX_VIDEO_MB} Mo).`)
      return
    }
    setVideoUploading(true)
    setError(null)
    try {
      // Upload DIRECT navigateur → bucket status-media (jamais de Server
      // Action pour la vidéo — pattern statuts). L'action ne reçoit que le
      // chemin de stockage, revalidé côté serveur avant envoi.
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const path = `${restaurantId}/${crypto.randomUUID()}.mp4`
      const { error: uploadError } = await supabase.storage
        .from('status-media')
        .upload(path, file, { contentType: 'video/mp4' })
      if (uploadError) throw new Error(uploadError.message)
      setVideoPath(path)
    } catch (err) {
      setError(errorMessage(err, "L'upload de la vidéo a échoué. Réessayez."))
    } finally {
      setVideoUploading(false)
    }
  }

  function validateClient(): string | null {
    if (type === 'text' && !body.trim()) return 'Écrivez un message.'
    if (type === 'image') {
      if (imageUploading) return "Attendez la fin de l'upload."
      if (!imageUrl) return 'Ajoutez une image.'
    }
    if (type === 'video') {
      if (videoUploading) return "Attendez la fin de l'upload."
      if (!videoPath) return 'Ajoutez une vidéo.'
    }
    if (type === 'poll') {
      if (!question.trim()) return 'Écrivez une question.'
      const nonEmpty = options.map((o) => o.trim()).filter(Boolean)
      if (nonEmpty.length < POLL_MIN_OPTIONS) return `Ajoutez au moins ${POLL_MIN_OPTIONS} options.`
    }
    return null
  }

  async function onSubmit() {
    setError(null)
    setSuccess(null)
    const clientError = validateClient()
    if (clientError) {
      setError(clientError)
      return
    }
    setSending(true)
    try {
      if (type === 'text') {
        const fd = new FormData()
        fd.set('body', body)
        await postChannelText(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'image') {
        const fd = new FormData()
        fd.set('image_url', imageUrl)
        fd.set('caption', imageCaption)
        await postChannelImage(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'video') {
        const fd = new FormData()
        fd.set('media_path', videoPath)
        fd.set('caption', videoCaption)
        await postChannelVideo(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'album') {
        const result = await postChannelCatalog()
        setSuccess(`Carte publiée (${result.sent} plats).`)
      } else {
        const fd = new FormData()
        fd.set('question', question)
        options.forEach((o) => fd.append('options', o))
        await postChannelPoll(fd)
        setSuccess('Sondage publié sur la chaîne.')
      }
      resetForm()
    } catch (err) {
      setError(errorMessage(err, 'Impossible de publier sur la chaîne. Réessayez.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Publier sur la chaîne</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Tabs value={type} onValueChange={(v) => setType(v as ChannelPostType)}>
          <TabsList>
            {(Object.keys(TYPE_LABELS) as ChannelPostType[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                {TYPE_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {type === 'text' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chaine-body">Message</Label>
            <Textarea
              id="chaine-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Votre actualité, promotion…"
              rows={4}
            />
          </div>
        )}

        {type === 'image' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-image">Image</Label>
              <Input id="chaine-image" type="file" accept="image/*" onChange={onImageFileChange} />
              {imageUploading && <p className="text-sm text-muted-foreground">Upload…</p>}
              {imageUrl && !imageUploading && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="mt-1 max-h-32 rounded-lg object-cover" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-image-caption">Légende (optionnel)</Label>
              <Textarea
                id="chaine-image-caption"
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                rows={2}
                placeholder="Votre légende…"
              />
            </div>
          </div>
        )}

        {type === 'video' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-video">Vidéo (mp4, {MAX_VIDEO_MB} Mo max)</Label>
              <Input id="chaine-video" type="file" accept="video/mp4" onChange={onVideoFileChange} />
              {videoUploading && <p className="text-sm text-muted-foreground">Upload…</p>}
              {videoPath && !videoUploading && <p className="text-sm text-muted-foreground">Vidéo prête.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-video-caption">Légende (optionnel)</Label>
              <Textarea
                id="chaine-video-caption"
                value={videoCaption}
                onChange={(e) => setVideoCaption(e.target.value)}
                rows={2}
                placeholder="Votre légende…"
              />
            </div>
          </div>
        )}

        {type === 'album' && (
          <p className="text-sm text-muted-foreground">
            Envoie chaque plat disponible avec photo (jusqu&apos;à 10) en photo légendée « Nom — Prix FCFA ».
          </p>
        )}

        {type === 'poll' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-poll-question">Question</Label>
              <Input
                id="chaine-poll-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Votre question…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Options</Label>
              <div className="flex flex-col gap-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    {options.length > POLL_MIN_OPTIONS && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeOption(i)}
                        aria-label={`Supprimer l’option ${i + 1}`}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 self-start"
                disabled={options.length >= POLL_MAX_OPTIONS}
                onClick={addOption}
              >
                Ajouter une option
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={sending} onClick={onSubmit}>
            {sending ? 'Publication…' : type === 'album' ? 'Publier ma carte' : 'Publier'}
          </Button>
          {success && !sending && <span className="text-sm text-muted-foreground">{success}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
