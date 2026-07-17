'use client'
import { useState } from 'react'
import { Check, Copy, Download, ScanLine } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
    <Card className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold leading-tight">{keyword}</h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <ScanLine className="size-3.5" />
          <span className="font-semibold text-foreground">{count}</span>
          scan{count > 1 ? 's' : ''} · 30 j
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="flex justify-center">
        <div
          className="w-full max-w-[220px] rounded-xl border border-border bg-white p-4 shadow-sm"
          // eslint-disable-next-line react/no-danger -- SVG généré côté serveur par qrcode, pas d'entrée utilisateur
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <p className="truncate text-xs text-muted-foreground" title={link}>
        {link}
      </p>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCopy} className="h-11 flex-1">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copié' : 'Copier le lien'}
        </Button>
        <Button type="button" variant="outline" onClick={onDownload} className="h-11 flex-1">
          <Download className="size-4" />
          Télécharger
        </Button>
      </div>
    </Card>
  )
}
