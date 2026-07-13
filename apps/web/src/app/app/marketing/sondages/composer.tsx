'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
// Import relatif (et non `@/lib/...`) : `validateImagePath`/`MAX_IMAGE_MB` sont réutilisés
// tels quels depuis le composer Chaîne — même pattern d'upload DIRECT navigateur→bucket
// `status-media` que l'image teaser ci-dessous.
import { MAX_IMAGE_MB, validateImagePath } from '../chaine/shared'
import { createPoll } from './actions'
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  normalizeSurfaces,
  validatePollOptions,
  validateSurfaces,
  type PollSurface,
} from './shared'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

function validate(formData: FormData, hasChannel: boolean): string | null {
  const question = String(formData.get('question') ?? '').trim()
  const rawOptions = formData.getAll('options').map((o) => String(o).trim())
  const pollResult = validatePollOptions(question, rawOptions)
  if (!pollResult.ok) return pollResult.error

  const quiz = String(formData.get('quiz') ?? '') === 'on'
  if (quiz) {
    const idx = Number.parseInt(String(formData.get('quiz_correct') ?? ''), 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= pollResult.options.length) {
      return 'Sélectionnez la bonne réponse du quiz.'
    }
  }

  const rawSurfaces = formData.getAll('surfaces').map((s) => String(s)) as PollSurface[]
  const surfaces = normalizeSurfaces(rawSurfaces)
  const surfaceError = validateSurfaces(surfaces)
  if (surfaceError) return surfaceError
  if (surfaces.includes('channel') && !hasChannel) return 'Créez d’abord votre chaîne WhatsApp.'

  return null
}

export function Composer({ restaurantId, hasChannel }: { restaurantId: string; hasChannel: boolean }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [quiz, setQuiz] = useState(false)
  const [quizCorrect, setQuizCorrect] = useState<number | null>(null)
  const [surfaces, setSurfaces] = useState<PollSurface[]>(hasChannel ? ['channel'] : [])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Image teaser — upload DIRECT navigateur→bucket status-media (jamais de Server Action pour le
  // fichier lui-même — pattern chaine/composer.tsx). Seul le chemin (teaser_image_path) part vers
  // l'action ; l'URL publique n'est qu'un aperçu local.
  const [teaserImagePath, setTeaserImagePath] = useState('')
  const [teaserImageUrl, setTeaserImageUrl] = useState('')
  const [teaserImageUploading, setTeaserImageUploading] = useState(false)

  const teaserSelected = surfaces.includes('status_teaser')
  const channelLocked = teaserSelected

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  function addOption() {
    setOptions((prev) => (prev.length >= POLL_MAX_OPTIONS ? prev : [...prev, '']))
  }

  function removeOption(idx: number) {
    setOptions((prev) => {
      if (prev.length <= POLL_MIN_OPTIONS) return prev
      return prev.filter((_, i) => i !== idx)
    })
    setQuizCorrect((prev) => {
      if (prev === null) return prev
      if (prev === idx) return null
      if (prev > idx) return prev - 1
      return prev
    })
  }

  function onToggleQuiz(checked: boolean) {
    setQuiz(checked)
    if (!checked) setQuizCorrect(null)
  }

  function toggleSurface(surface: PollSurface) {
    setSurfaces((prev) => {
      // Chaîne verrouillée tant que Statut teaser est coché — « le vote a lieu sur la chaîne »
      // (invariant serveur re-vérifié par normalizeSurfaces côté action, cf. shared.ts).
      if (surface === 'channel' && prev.includes('status_teaser')) return prev
      const next = prev.includes(surface) ? prev.filter((s) => s !== surface) : [...prev, surface]
      return normalizeSurfaces(next)
    })
  }

  function resetTeaserImage() {
    setTeaserImagePath('')
    setTeaserImageUrl('')
  }

  function reset() {
    setQuestion('')
    setOptions(['', ''])
    setQuiz(false)
    setQuizCorrect(null)
    setSurfaces(hasChannel ? ['channel'] : [])
    resetTeaserImage()
  }

  async function onTeaserImageChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    setTeaserImageUploading(true)
    setError(null)
    try {
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
      const pathError = validateImagePath(path, restaurantId)
      if (pathError) throw new Error(pathError)
      const publicUrl = supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
      setTeaserImagePath(path)
      setTeaserImageUrl(publicUrl)
    } catch (err) {
      setError(errorMessage(err, "L'upload de l'image a échoué. Réessayez."))
    } finally {
      setTeaserImageUploading(false)
    }
  }

  async function onSubmit(formData: FormData) {
    setError(null)
    setSent(false)
    const clientError = validate(formData, hasChannel)
    if (clientError) {
      setError(clientError)
      return
    }
    if (teaserSelected && teaserImageUploading) {
      setError("Attendez la fin de l'upload.")
      return
    }
    setSending(true)
    try {
      await createPoll(formData)
      setSent(true)
      reset()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’envoyer le sondage. Réessayez.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Nouveau sondage</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              name="question"
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
                    name="options"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  {quiz && (
                    <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="quiz_correct"
                        value={i}
                        checked={quizCorrect === i}
                        onChange={() => setQuizCorrect(i)}
                        className="accent-primary"
                      />
                      Correcte
                    </label>
                  )}
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

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="quiz"
              checked={quiz}
              onChange={(e) => onToggleQuiz(e.target.checked)}
              className="size-4 accent-primary"
            />
            Quiz (avec bonne réponse)
          </label>

          <div className="flex flex-col gap-2">
            <Label>Surfaces</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="surfaces"
                value="channel"
                checked={surfaces.includes('channel')}
                disabled={!hasChannel || channelLocked}
                onChange={() => toggleSurface('channel')}
                className="size-4 accent-primary"
              />
              {channelLocked ? 'Le vote a lieu sur la chaîne' : 'Chaîne WhatsApp'}
            </label>
            {channelLocked && <input type="hidden" name="surfaces" value="channel" />}
            {!hasChannel && <p className="ml-6 text-xs text-muted-foreground">Créez d’abord votre chaîne.</p>}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="surfaces"
                value="group"
                checked={surfaces.includes('group')}
                onChange={() => toggleSurface('group')}
                className="size-4 accent-primary"
              />
              Groupe staff
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="surfaces"
                value="status_teaser"
                checked={teaserSelected}
                disabled={!hasChannel}
                onChange={() => toggleSurface('status_teaser')}
                className="size-4 accent-primary"
              />
              Statut teaser
            </label>
          </div>

          {teaserSelected && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <Label htmlFor="poll-teaser-image">Image du teaser (optionnel)</Label>
              <Input id="poll-teaser-image" type="file" accept="image/*" onChange={onTeaserImageChange} />
              {teaserImageUploading && <p className="text-sm text-muted-foreground">Upload…</p>}
              {teaserImageUrl && !teaserImageUploading && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={teaserImageUrl} alt="" className="mt-1 max-h-32 rounded-lg object-cover" />
              )}
              <input type="hidden" name="teaser_image_path" value={teaserImagePath} />
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={sending}>
              {sending ? 'Envoi…' : 'Envoyer le sondage'}
            </Button>
            {sent && !sending && (
              <span className="text-sm text-muted-foreground">Envoi en cours — effectif sous une minute.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
