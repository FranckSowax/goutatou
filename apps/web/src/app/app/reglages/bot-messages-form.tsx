'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateMyBotMessages } from './actions'

type BotMessagesFormProps = {
  botWelcome: string | null
  botInfoExtra: string | null
}

export function BotMessagesForm({ botWelcome, botInfoExtra }: BotMessagesFormProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await updateMyBotMessages(formData)
        setResult({ ok: true, message: 'Messages enregistrés.' })
      } catch {
        // Next redige les messages d'erreur des Server Actions en prod (texte
        // anglais générique) : on affiche TOUJOURS le message FR fixe.
        setResult({ ok: false, message: 'Enregistrement impossible.' })
      }
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bot_welcome">Message d’accueil</Label>
        <Textarea id="bot_welcome" name="bot_welcome" defaultValue={botWelcome ?? ''} />
        <p className="text-xs text-muted-foreground">Vide = message par défaut</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bot_info_extra">Infos complémentaires</Label>
        <Textarea id="bot_info_extra" name="bot_info_extra" defaultValue={botInfoExtra ?? ''} />
        <p className="text-xs text-muted-foreground">Ajoutées à la réponse « infos » du bot</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          Enregistrer
        </Button>
        {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
      </div>
    </form>
  )
}
