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
  postChannelImage,
  postChannelMenuCard,
  postChannelPoll,
  postChannelText,
  postChannelVideo,
  scheduleChannelPost,
} from './actions'
import {
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  appendOrderLink,
  type ChannelPostType,
} from './shared'

const TYPE_LABELS: Record<ChannelPostType, string> = {
  text: 'Texte',
  image: 'Photo',
  video: 'Vidéo',
  menu_card: 'Carte menu',
  poll: 'Sondage',
}

/** Types acceptant la programmation (v1) — vidéo et sondage restent immédiats seulement. */
const SCHEDULABLE_TYPES: ChannelPostType[] = ['text', 'image', 'menu_card']

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe le plus
  // pertinent, sauf pour nos propres Error() qui portent un message FR.
  if (_e instanceof Error && _e.message && !/^An error occurred/i.test(_e.message)) return _e.message
  return fallback
}

export function Composer({
  restaurantId,
  contactPhone,
}: {
  restaurantId: string
  contactPhone: string | null
}) {
  const [type, setType] = useState<ChannelPostType>('text')

  // Texte
  const [body, setBody] = useState('')

  // Photo — upload DIRECT navigateur→bucket (jamais de Server Action pour le
  // fichier lui-même) : on garde le chemin de stockage (media_path, transmis
  // aux Server Actions) ET l'URL publique (aperçu uniquement).
  const [imagePath, setImagePath] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [imageUploading, setImageUploading] = useState(false)

  // Vidéo
  const [videoPath, setVideoPath] = useState('')
  const [videoCaption, setVideoCaption] = useState('')
  const [videoUploading, setVideoUploading] = useState(false)

  // Carte menu
  const [menuCardPath, setMenuCardPath] = useState('')
  const [menuCardCaption, setMenuCardCaption] = useState('')
  const [menuCardUploading, setMenuCardUploading] = useState(false)

  // Sondage
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  // Programmation (text/image/menu_card) + bouton Commander
  const [scheduledAt, setScheduledAt] = useState('')
  const [addOrderButton, setAddOrderButton] = useState(true)

  const [pendingAction, setPendingAction] = useState<'publish' | 'schedule' | null>(null)
  const sending = pendingAction !== null
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const contactDigits = (contactPhone ?? '').replace(/\D/g, '')

  function resetForm() {
    setBody('')
    setImagePath('')
    setImageUrl('')
    setImageCaption('')
    setVideoPath('')
    setVideoCaption('')
    setMenuCardPath('')
    setMenuCardCaption('')
    setQuestion('')
    setOptions(['', ''])
    setScheduledAt('')
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
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image.')
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image trop lourde (max ${MAX_IMAGE_MB} Mo).`)
      return
    }
    setImageUploading(true)
    setError(null)
    try {
      // Upload DIRECT navigateur → bucket status-media (jamais de Server
      // Action pour l'image — même pattern que la vidéo/la carte menu :
      // l'id d'une Server Action change à chaque build, un onglet resté
      // ouvert produirait un 404 sur l'upload).
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg').toLowerCase()
      const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('status-media')
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)
      const publicUrl = supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
      setImagePath(path)
      setImageUrl(publicUrl)
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

  async function onMenuCardFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('La carte doit être une image.')
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image trop lourde (max ${MAX_IMAGE_MB} Mo).`)
      return
    }
    setMenuCardUploading(true)
    setError(null)
    try {
      // Upload DIRECT navigateur → bucket status-media (jamais de Server
      // Action pour le fichier — pattern vidéo/statuts). L'action ne reçoit
      // que le chemin de stockage, revalidé côté serveur avant envoi.
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg').toLowerCase()
      const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('status-media')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)
      setMenuCardPath(path)
    } catch (err) {
      setError(errorMessage(err, "L'upload de la carte a échoué. Réessayez."))
    } finally {
      setMenuCardUploading(false)
    }
  }

  function validateClient(action: 'publish' | 'schedule'): string | null {
    if (type === 'text' && !body.trim()) return 'Écrivez un message.'
    if (type === 'image') {
      if (imageUploading) return "Attendez la fin de l'upload."
      if (!imagePath) return 'Ajoutez une image.'
    }
    if (type === 'video') {
      if (videoUploading) return "Attendez la fin de l'upload."
      if (!videoPath) return 'Ajoutez une vidéo.'
    }
    if (type === 'menu_card') {
      if (menuCardUploading) return "Attendez la fin de l'upload."
      if (!menuCardPath) return 'Ajoutez une image de votre carte.'
    }
    if (type === 'poll') {
      if (!question.trim()) return 'Écrivez une question.'
      const nonEmpty = options.map((o) => o.trim()).filter(Boolean)
      if (nonEmpty.length < POLL_MIN_OPTIONS) return `Ajoutez au moins ${POLL_MIN_OPTIONS} options.`
    }
    if (action === 'schedule') {
      if (!SCHEDULABLE_TYPES.includes(type)) {
        return 'La programmation n’est pas disponible pour ce type de post.'
      }
      if (!scheduledAt.trim()) return 'Choisissez une date et une heure.'
    }
    return null
  }

  async function onSubmit(action: 'publish' | 'schedule') {
    setError(null)
    setSuccess(null)
    const clientError = validateClient(action)
    if (clientError) {
      setError(clientError)
      return
    }
    setPendingAction(action)
    try {
      if (action === 'schedule') {
        const fd = new FormData()
        fd.set('kind', type)
        const rawContent = type === 'text' ? body : type === 'image' ? imageCaption : menuCardCaption
        fd.set('content', addOrderButton ? appendOrderLink(rawContent, contactPhone) : rawContent)
        if (type === 'image') fd.set('media_path', imagePath)
        if (type === 'menu_card') fd.set('media_path', menuCardPath)
        fd.set('scheduled_at', new Date(scheduledAt).toISOString())
        await scheduleChannelPost(fd)
        setSuccess('Post programmé.')
      } else if (type === 'text') {
        const fd = new FormData()
        fd.set('body', addOrderButton ? appendOrderLink(body, contactPhone) : body)
        await postChannelText(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'image') {
        const fd = new FormData()
        fd.set('media_path', imagePath)
        fd.set('caption', addOrderButton ? appendOrderLink(imageCaption, contactPhone) : imageCaption)
        await postChannelImage(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'video') {
        const fd = new FormData()
        fd.set('media_path', videoPath)
        fd.set('caption', videoCaption)
        await postChannelVideo(fd)
        setSuccess('Publié sur la chaîne.')
      } else if (type === 'menu_card') {
        const fd = new FormData()
        fd.set('media_path', menuCardPath)
        fd.set('caption', addOrderButton ? appendOrderLink(menuCardCaption, contactPhone) : menuCardCaption)
        await postChannelMenuCard(fd)
        setSuccess('Carte publiée sur la chaîne.')
      } else {
        const fd = new FormData()
        fd.set('question', question)
        options.forEach((o) => fd.append('options', o))
        await postChannelPoll(fd)
        setSuccess('Sondage publié sur la chaîne.')
      }
      resetForm()
    } catch (err) {
      setError(
        errorMessage(
          err,
          action === 'schedule' ? 'Impossible de programmer ce post. Réessayez.' : 'Impossible de publier sur la chaîne. Réessayez.',
        ),
      )
    } finally {
      setPendingAction(null)
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

        {type === 'menu_card' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-menu-card">Photo de votre carte (image, {MAX_IMAGE_MB} Mo max)</Label>
              <Input id="chaine-menu-card" type="file" accept="image/*" onChange={onMenuCardFileChange} />
              {menuCardUploading && <p className="text-sm text-muted-foreground">Upload…</p>}
              {menuCardPath && !menuCardUploading && (
                <p className="text-sm text-muted-foreground">Carte prête.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-menu-card-caption">Légende (optionnel)</Label>
              <Textarea
                id="chaine-menu-card-caption"
                value={menuCardCaption}
                onChange={(e) => setMenuCardCaption(e.target.value)}
                rows={2}
                placeholder="📋 Notre carte — commandez sur WhatsApp !"
              />
            </div>
          </div>
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

        {SCHEDULABLE_TYPES.includes(type) && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {contactDigits && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addOrderButton}
                  onChange={(e) => setAddOrderButton(e.target.checked)}
                  className="accent-primary"
                />
                Ajouter le bouton Commander
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chaine-scheduled-at">Programmer pour plus tard (optionnel)</Label>
              <Input
                id="chaine-scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-56"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={sending} onClick={() => onSubmit('publish')}>
            {pendingAction === 'publish' ? 'Publication…' : type === 'menu_card' ? 'Publier ma carte' : 'Publier'}
          </Button>
          {SCHEDULABLE_TYPES.includes(type) && (
            <Button type="button" variant="outline" disabled={sending} onClick={() => onSubmit('schedule')}>
              {pendingAction === 'schedule' ? 'Programmation…' : 'Programmer'}
            </Button>
          )}
          {success && !sending && <span className="text-sm text-muted-foreground">{success}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
