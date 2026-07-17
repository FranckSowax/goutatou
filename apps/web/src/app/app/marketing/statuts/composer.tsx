'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { createStatusBatch } from './actions'
import { StatusPreview } from './status-preview'
import {
  BG_COLORS,
  CAPTION_COLORS,
  FONT_STYLES,
  IMAGE_EXTENSION_REGEX,
  MAX_CARDS,
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
} from './shared'
import type { StatusAudience, StatusCardKind, StatusPublishMode } from './shared'

interface ComposerCard {
  localId: string
  kind: StatusCardKind
  content: string
  mediaUrl: string | null
  mediaPath: string | null
  bgColor: string
  captionColor: string
  fontType: number
  audience: StatusAudience
  scheduledAt: string
  uploading: boolean
}

function newCard(): ComposerCard {
  return {
    localId: crypto.randomUUID(),
    kind: 'text',
    content: '',
    mediaUrl: null,
    mediaPath: null,
    bgColor: BG_COLORS[0].value,
    captionColor: CAPTION_COLORS[0].value,
    fontType: 0,
    audience: 'all',
    scheduledAt: '',
    uploading: false,
  }
}

/** Extension de fichier acceptée pour l'upload direct image (nom de fichier, puis type MIME en repli). */
function imageExtension(file: File): string | null {
  const fromName = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
  if (fromName && IMAGE_EXTENSION_REGEX.test(`.${fromName}`)) return fromName
  const fromType = file.type.split('/')[1]?.toLowerCase()
  const normalized = fromType === 'jpeg' ? 'jpg' : fromType
  if (normalized && IMAGE_EXTENSION_REGEX.test(`.${normalized}`)) return normalized
  return null
}

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe le plus
  // pertinent, sauf pour nos propres Error() qui portent un message FR.
  if (_e instanceof Error && _e.message && !/^An error occurred/i.test(_e.message)) return _e.message
  return fallback
}

export function Composer({ restaurantId, isPremium }: { restaurantId: string; isPremium: boolean }) {
  const [cards, setCards] = useState<ComposerCard[]>([newCard()])
  const [activeId, setActiveId] = useState<string>(cards[0].localId)
  const [mode, setMode] = useState<StatusPublishMode>('chain')
  // Écho statut → chaîne : un seul état global (pas par carte, cf. plan
  // Chaîne Auto — choix « globale pour simplicité »).
  const [echoToChannel, setEchoToChannel] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const active = cards.find((c) => c.localId === activeId) ?? cards[0]

  function updateCard(id: string, patch: Partial<ComposerCard>) {
    setCards((prev) => prev.map((c) => (c.localId === id ? { ...c, ...patch } : c)))
  }

  function addCard() {
    setCards((prev) => {
      if (prev.length >= MAX_CARDS) return prev
      const card = newCard()
      setActiveId(card.localId)
      return [...prev, card]
    })
  }

  function removeCard(id: string) {
    setCards((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((c) => c.localId !== id)
      if (activeId === id) setActiveId(next[0].localId)
      return next
    })
  }

  async function onImageUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = imageExtension(file)
    if (!ext) {
      setError('Format d’image non supporté (jpg, png, gif, webp, heic).')
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image trop lourde (max ${MAX_IMAGE_MB} Mo).`)
      return
    }
    updateCard(id, { uploading: true })
    setError(null)
    try {
      // Upload DIRECT navigateur → bucket status-media (jamais de Server
      // Action pour l'image — même pattern que la vidéo : l'id d'une Server
      // Action change à chaque build, un onglet resté ouvert produirait un
      // 404 sur l'upload).
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('status-media')
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)
      const publicUrl = supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
      updateCard(id, { mediaPath: path, mediaUrl: publicUrl })
    } catch (err) {
      setError(errorMessage(err, "L'upload de l'image a échoué. Réessayez."))
    } finally {
      updateCard(id, { uploading: false })
    }
  }

  async function onVideoUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
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
    updateCard(id, { uploading: true })
    setError(null)
    try {
      // Upload DIRECT navigateur → bucket status-media (jamais de Server
      // Action pour la vidéo — pattern hero LP). L'action ne reçoit que le
      // chemin de stockage, revalidé côté serveur avant insertion.
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const path = `${restaurantId}/${crypto.randomUUID()}.mp4`
      const { error: uploadError } = await supabase.storage
        .from('status-media')
        .upload(path, file, { contentType: 'video/mp4' })
      if (uploadError) throw new Error(uploadError.message)
      const publicUrl = supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
      updateCard(id, { mediaPath: path, mediaUrl: publicUrl })
    } catch (err) {
      setError(errorMessage(err, "L'upload de la vidéo a échoué. Réessayez."))
    } finally {
      updateCard(id, { uploading: false })
    }
  }

  function validateClient(): string | null {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]
      if (!c.content.trim()) return `Carte ${i + 1} : écrivez un contenu.`
      if (c.kind === 'image' && !c.mediaPath) return `Carte ${i + 1} : ajoutez une image.`
      if (c.kind === 'video' && !c.mediaPath) return `Carte ${i + 1} : ajoutez une vidéo.`
      if (c.uploading) return `Carte ${i + 1} : attendez la fin de l’upload.`
      if (mode === 'schedule' && !c.scheduledAt.trim()) return `Carte ${i + 1} : choisissez une date et une heure.`
    }
    return null
  }

  async function onSubmit() {
    setError(null)
    setSent(false)
    const clientError = validateClient()
    if (clientError) {
      setError(clientError)
      return
    }
    setSending(true)
    try {
      const payload = cards.map((c) => ({
        kind: c.kind,
        content: c.content,
        // Image ET vidéo transmettent le chemin de stockage (upload direct
        // navigateur→bucket) ; le serveur résout l'URL publique.
        mediaUrl: null,
        mediaPath: c.kind === 'video' || c.kind === 'image' ? c.mediaPath : null,
        bgColor: c.bgColor,
        captionColor: c.captionColor,
        fontType: c.fontType,
        audience: c.audience,
        // Converti en ISO côté navigateur (fuseau du restaurateur), pour
        // éviter toute ambiguïté si le serveur tourne dans un autre fuseau.
        scheduledAt:
          mode === 'schedule' && c.scheduledAt.trim() ? new Date(c.scheduledAt).toISOString() : null,
      }))
      const fd = new FormData()
      fd.set('mode', mode)
      fd.set('cards_json', JSON.stringify(payload))
      fd.set('echo_to_channel', String(echoToChannel))
      await createStatusBatch(fd)
      setSent(true)
      const fresh = newCard()
      setCards([fresh])
      setActiveId(fresh.localId)
    } catch (err) {
      setError(errorMessage(err, 'Impossible d’enregistrer les statuts. Réessayez.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl p-6 lg:col-span-2">
        <h2 className="mb-4 font-display text-lg font-semibold">Nouveau statut</h2>
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <div className="flex flex-col gap-4">
          {cards.map((card, index) => (
            <div
              key={card.localId}
              onClick={() => setActiveId(card.localId)}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4',
                card.localId === activeId ? 'border-primary/50 bg-accent/40' : 'border-border',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold">Carte {index + 1}</span>
                <div className="flex items-center gap-2">
                  <Tabs
                    value={card.kind}
                    onValueChange={(v) => updateCard(card.localId, { kind: v as StatusCardKind })}
                  >
                    <TabsList>
                      <TabsTrigger value="text">Texte</TabsTrigger>
                      <TabsTrigger value="image">Image</TabsTrigger>
                      <TabsTrigger value="video">Vidéo</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {cards.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Supprimer la carte ${index + 1}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeCard(card.localId)
                      }}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`content-${card.localId}`}>
                  {card.kind === 'text' ? 'Texte du statut' : 'Légende'}
                </Label>
                <Textarea
                  id={`content-${card.localId}`}
                  value={card.content}
                  onChange={(e) => updateCard(card.localId, { content: e.target.value })}
                  rows={3}
                  placeholder="Votre statut…"
                />
              </div>

              {card.kind === 'image' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`media-${card.localId}`}>Image</Label>
                  <Input
                    id={`media-${card.localId}`}
                    type="file"
                    accept="image/*"
                    onChange={(e) => onImageUpload(card.localId, e)}
                  />
                  {card.uploading && <p className="text-sm text-muted-foreground">Upload…</p>}
                  {card.mediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.mediaUrl} alt="" className="mt-1 max-h-32 rounded-lg object-cover" />
                  )}
                </div>
              )}

              {card.kind === 'video' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`media-${card.localId}`}>Vidéo (mp4, {MAX_VIDEO_MB} Mo max)</Label>
                  <Input
                    id={`media-${card.localId}`}
                    type="file"
                    accept="video/mp4"
                    onChange={(e) => onVideoUpload(card.localId, e)}
                  />
                  {card.uploading && <p className="text-sm text-muted-foreground">Upload…</p>}
                  {card.mediaUrl && !card.uploading && (
                    <p className="text-sm text-muted-foreground">Vidéo prête.</p>
                  )}
                </div>
              )}

              {card.kind === 'text' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Fond</Label>
                  <div className="flex flex-wrap gap-2">
                    {BG_COLORS.map((bg) => (
                      <button
                        key={bg.value}
                        type="button"
                        title={bg.label}
                        aria-label={bg.label}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateCard(card.localId, { bgColor: bg.value })
                        }}
                        className={cn(
                          'size-7 rounded-full ring-2 ring-offset-2 ring-offset-card',
                          card.bgColor === bg.value ? 'ring-primary' : 'ring-transparent',
                        )}
                        style={{ backgroundColor: bg.value }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {card.kind !== 'video' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Couleur légende</Label>
                    <div className="flex gap-2">
                      {CAPTION_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateCard(card.localId, { captionColor: c.value })
                          }}
                          className={cn(
                            'rounded-lg border px-2.5 py-1 text-xs font-medium',
                            card.captionColor === c.value
                              ? 'border-primary bg-accent text-accent-foreground'
                              : 'border-border text-muted-foreground',
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`font-${card.localId}`}>Police</Label>
                    <select
                      id={`font-${card.localId}`}
                      value={card.fontType}
                      onChange={(e) => updateCard(card.localId, { fontType: Number(e.target.value) })}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                      {FONT_STYLES.map((f) => (
                        <option key={f.index} value={f.index}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Audience</Label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`audience-${card.localId}`}
                      checked={card.audience === 'all'}
                      onChange={(e) => {
                        e.stopPropagation()
                        updateCard(card.localId, { audience: 'all' })
                      }}
                      className="accent-primary"
                    />
                    Tous les clients
                  </label>
                  <label
                    className={cn('flex items-center gap-2 text-sm', !isPremium && 'text-muted-foreground')}
                    title={isPremium ? undefined : 'Réservé au plan Premium'}
                  >
                    <input
                      type="radio"
                      name={`audience-${card.localId}`}
                      checked={card.audience === 'optin'}
                      disabled={!isPremium}
                      onChange={(e) => {
                        e.stopPropagation()
                        updateCard(card.localId, { audience: 'optin' })
                      }}
                      className="accent-primary"
                    />
                    Clients opt-in 👑
                    {!isPremium && <span className="text-xs">(Premium)</span>}
                  </label>
                </div>
              </div>

              {mode === 'schedule' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`sched-${card.localId}`}>Date et heure</Label>
                  <Input
                    id={`sched-${card.localId}`}
                    type="datetime-local"
                    value={card.scheduledAt}
                    onChange={(e) => updateCard(card.localId, { scheduledAt: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={cards.length >= MAX_CARDS}
            onClick={addCard}
          >
            Ajouter une carte
          </Button>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <Label>Publication</Label>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={mode === 'chain'}
                  onChange={() => setMode('chain')}
                  className="accent-primary"
                />
                Publier maintenant à la suite
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={mode === 'schedule'}
                  onChange={() => setMode('schedule')}
                  className="accent-primary"
                />
                Heure par carte
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={mode === 'draft'}
                  onChange={() => setMode('draft')}
                  className="accent-primary"
                />
                Brouillon
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={echoToChannel}
              onChange={(e) => setEchoToChannel(e.target.checked)}
              className="accent-primary"
            />
            Publier aussi sur la chaîne
          </label>

          <div className="flex items-center gap-3">
            <Button type="button" disabled={sending} onClick={onSubmit}>
              {sending ? 'Envoi…' : 'Enregistrer'}
            </Button>
            {sent && !sending && <span className="text-sm text-muted-foreground">Statuts enregistrés.</span>}
          </div>
        </div>
      </Card>

      <aside className="lg:col-span-1">
        <Card className="rounded-2xl p-6 lg:sticky lg:top-4">
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Aperçu en direct</span>
            <StatusPreview
              className="max-w-xs"
              data={{
                kind: active.kind,
                content: active.content,
                mediaUrl: active.mediaUrl,
                bgColor: active.bgColor,
                captionColor: active.captionColor,
                fontType: active.fontType,
              }}
            />
          </div>
        </Card>
      </aside>
    </div>
  )
}
