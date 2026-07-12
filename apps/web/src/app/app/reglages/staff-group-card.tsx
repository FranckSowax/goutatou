'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createStaffGroup } from './actions'

type StaffGroupCardProps = {
  restaurantName: string
  channelConnected: boolean
  contactPhone: string | null
  staffGroupId: string | null
  invite: string | null
  svg: string | null
}

export function StaffGroupCard({
  restaurantName,
  channelConnected,
  contactPhone,
  staffGroupId,
  invite,
  svg,
}: StaffGroupCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function onCreate() {
    setSaving(true)
    setError(null)
    try {
      await createStaffGroup()
    } catch {
      // Next redige les messages d'erreur des Server Actions en prod (texte
      // anglais générique) : on affiche TOUJOURS le message FR fixe.
      setError('Impossible de créer le groupe — vérifiez que votre canal WhatsApp est connecté.')
    } finally {
      setSaving(false)
    }
  }

  async function onCopy() {
    if (!invite) return
    await navigator.clipboard.writeText(invite)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (staffGroupId) {
    if (!invite) {
      return (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm text-muted-foreground">Groupe Cuisine {restaurantName} créé.</p>
          <p className="text-sm text-muted-foreground">
            Lien d&apos;invitation indisponible — ouvrez le groupe dans WhatsApp pour inviter.
          </p>
          <p className="text-xs text-muted-foreground">Les nouvelles commandes y seront postées automatiquement.</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center gap-3 text-center">
        {svg && (
          <div
            className="w-full max-w-[220px] rounded-xl bg-white p-3"
            // eslint-disable-next-line react/no-danger -- SVG généré côté serveur par qrcode, pas d'entrée utilisateur
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <p className="w-full truncate text-xs text-muted-foreground" title={invite}>
          {invite}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onCopy} className="w-full max-w-[220px]">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copié' : 'Copier le lien'}
        </Button>
        <p className="text-sm text-muted-foreground">Partagez ce lien à votre équipe.</p>
        <p className="text-xs text-muted-foreground">Les nouvelles commandes y seront postées automatiquement.</p>
      </div>
    )
  }

  if (!channelConnected) {
    return <p className="text-sm text-muted-foreground">Connectez d&apos;abord votre canal WhatsApp.</p>
  }

  const hasContactPhone = !!contactPhone

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Créez un groupe WhatsApp pour votre équipe en cuisine : les nouvelles commandes y seront postées
        automatiquement.
      </p>
      <p className="text-sm text-muted-foreground">
        {hasContactPhone
          ? `Votre numéro de contact (${contactPhone}) sera ajouté comme premier membre.`
          : "Renseignez d'abord votre téléphone de contact dans la fiche pratique — il sera le premier membre du groupe."}
      </p>
      {error && (
        <div
          role="alert"
          className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <Button type="button" onClick={onCreate} disabled={saving || !hasContactPhone}>
        {saving ? 'Création…' : `Créer le groupe Cuisine ${restaurantName}`}
      </Button>
    </div>
  )
}
