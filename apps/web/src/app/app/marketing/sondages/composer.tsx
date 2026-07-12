'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { createPoll } from './actions'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 12

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

function validate(formData: FormData, hasChannel: boolean): string | null {
  const question = String(formData.get('question') ?? '').trim()
  if (!question) return 'Écrivez une question.'
  const raw = formData.getAll('options').map((o) => String(o).trim()).filter(Boolean)
  if (raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) {
    return `Ajoutez entre ${MIN_OPTIONS} et ${MAX_OPTIONS} options non vides.`
  }
  if (new Set(raw).size !== raw.length) return 'Les options doivent être différentes les unes des autres.'
  const quiz = String(formData.get('quiz') ?? '') === 'on'
  if (quiz) {
    const idx = Number.parseInt(String(formData.get('quiz_correct') ?? ''), 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) return 'Sélectionnez la bonne réponse du quiz.'
  }
  const target = String(formData.get('target') ?? '')
  if (target !== 'channel' && target !== 'optin') return 'Choisissez une cible pour le sondage.'
  if (target === 'channel' && !hasChannel) return 'Créez d’abord votre chaîne WhatsApp.'
  return null
}

export function Composer({ hasChannel, optinCount }: { hasChannel: boolean; optinCount: number }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [quiz, setQuiz] = useState(false)
  const [quizCorrect, setQuizCorrect] = useState<number | null>(null)
  const [target, setTarget] = useState<'channel' | 'optin'>(hasChannel ? 'channel' : 'optin')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']))
  }

  function removeOption(idx: number) {
    setOptions((prev) => {
      if (prev.length <= MIN_OPTIONS) return prev
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

  function reset() {
    setQuestion('')
    setOptions(['', ''])
    setQuiz(false)
    setQuizCorrect(null)
    setTarget(hasChannel ? 'channel' : 'optin')
  }

  async function onSubmit(formData: FormData) {
    setError(null)
    setSent(false)
    const clientError = validate(formData, hasChannel)
    if (clientError) {
      setError(clientError)
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
                  {options.length > MIN_OPTIONS && (
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
              disabled={options.length >= MAX_OPTIONS}
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
            <Label>Cible</Label>
            <label className={cn('flex items-center gap-2 text-sm', !hasChannel && 'text-muted-foreground')}>
              <input
                type="radio"
                name="target"
                value="channel"
                checked={target === 'channel'}
                disabled={!hasChannel}
                onChange={() => setTarget('channel')}
                className="accent-primary"
              />
              Chaîne WhatsApp
            </label>
            {!hasChannel && (
              <p className="ml-6 text-xs text-muted-foreground">Créez d’abord votre chaîne.</p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="target"
                value="optin"
                checked={target === 'optin'}
                onChange={() => setTarget('optin')}
                className="accent-primary"
              />
              Clients opt-in ({optinCount})
            </label>
          </div>

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
