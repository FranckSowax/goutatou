'use client'
import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function QrCard({
  keyword,
  description,
  link,
  svg,
  count,
}: {
  keyword: string
  description: string
  link: string
  svg: string
  count: number
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function onDownload() {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-${keyword.toLowerCase()}.svg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-display text-base">{keyword}</CardTitle>
          <Badge variant="secondary">{count} scan{count > 1 ? 's' : ''} · 30 j</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 px-0">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div
          className="w-full max-w-[220px] rounded-xl bg-white p-3"
          // eslint-disable-next-line react/no-danger -- SVG généré côté serveur par qrcode, pas d'entrée utilisateur
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="w-full truncate text-xs text-muted-foreground" title={link}>{link}</p>
        <div className="flex w-full flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopy} className="flex-1">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copié' : 'Copier le lien'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDownload} className="flex-1">
            <Download className="size-3.5" />
            Télécharger
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
