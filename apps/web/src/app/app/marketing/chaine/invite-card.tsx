'use client'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function InviteCard({ invite, svg }: { invite: string | null; svg: string | null }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (!invite) return
    await navigator.clipboard.writeText(invite)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!invite) {
    return (
      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Lien d&apos;invitation</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <p className="text-sm text-muted-foreground">
            Le lien d&apos;invitation n&apos;est pas encore disponible pour cette chaîne.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Lien d&apos;invitation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 px-0">
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
        <Button type="button" variant="outline" size="sm" onClick={onCopy} className="w-full">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copié' : 'Copier le lien'}
        </Button>
      </CardContent>
    </Card>
  )
}
