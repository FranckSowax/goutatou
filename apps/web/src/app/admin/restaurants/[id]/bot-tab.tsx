'use client'

import { useState, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateBotMessages, updateChannelToken, getPairingCode, getLoginQrAction } from './actions'
import { renderBotInfosPreview, renderBotWelcomePreview } from './bot-info-preview'

type ChannelStatus = 'active' | 'error' | string

function badgeVariantForChannel(status: ChannelStatus | undefined) {
  if (status === 'active') return 'success' as const
  if (status === 'error') return 'destructive' as const
  return 'muted' as const
}

function channelLabel(status: ChannelStatus | undefined) {
  if (status === 'active') return 'Actif'
  if (status === 'error') return 'Erreur'
  return 'Non configuré'
}

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

/** Rendu minimal du gras WhatsApp (*texte*) dans la bulle d'aperçu. */
function renderWhatsappText(text: string): ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export type BotTabProfile = {
  address: string | null
  contact_phone: string | null
  hours_text: string | null
  delivery_info: string | null
}

export function BotTab({
  restaurantId,
  channelStatus,
  lastWebhookAt,
  webhookButton,
  hasChannel,
  channelPhone,
  botWelcome,
  botInfoExtra,
  profile,
}: {
  restaurantId: string
  channelStatus: string | undefined
  lastWebhookAt: string | null
  webhookButton?: ReactNode
  hasChannel: boolean
  channelPhone: string | null
  botWelcome: string | null
  botInfoExtra: string | null
  profile: BotTabProfile
}) {
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)

  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [messagesSaving, setMessagesSaving] = useState(false)
  const [messagesSaved, setMessagesSaved] = useState(false)
  const [welcomeDraft, setWelcomeDraft] = useState(botWelcome ?? '')
  const [infoExtraDraft, setInfoExtraDraft] = useState(botInfoExtra ?? '')

  const [pairingPhone, setPairingPhone] = useState(channelPhone ?? '')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)

  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  async function handleGetPairingCode() {
    setPairingLoading(true)
    setPairingError(null)
    setPairingCode(null)
    try {
      const { code } = await getPairingCode(restaurantId, pairingPhone)
      setPairingCode(code)
    } catch (e) {
      setPairingError(errorMessage(e, 'Impossible de contacter Whapi — le canal n’existe peut-être plus.'))
    } finally {
      setPairingLoading(false)
    }
  }

  async function handleShowQr() {
    setQrLoading(true)
    setQrError(null)
    setQrBase64(null)
    try {
      const { base64 } = await getLoginQrAction(restaurantId)
      setQrBase64(base64)
    } catch (e) {
      setQrError(errorMessage(e, 'Impossible de contacter Whapi — le canal n’existe peut-être plus.'))
    } finally {
      setQrLoading(false)
    }
  }

  async function handleTokenSubmit(formData: FormData) {
    setTokenSaving(true)
    setTokenError(null)
    setTokenSaved(false)
    try {
      await updateChannelToken(restaurantId, formData)
      setTokenSaved(true)
    } catch (e) {
      setTokenError(errorMessage(e, "Impossible d'enregistrer le token du canal."))
    } finally {
      setTokenSaving(false)
    }
  }

  async function handleMessagesSubmit(formData: FormData) {
    setMessagesSaving(true)
    setMessagesError(null)
    setMessagesSaved(false)
    try {
      await updateBotMessages(restaurantId, formData)
      setMessagesSaved(true)
    } catch (e) {
      setMessagesError(errorMessage(e, "Impossible d'enregistrer les messages du bot."))
    } finally {
      setMessagesSaving(false)
    }
  }

  const infosPreview = renderBotInfosPreview({
    address: profile.address,
    hoursText: profile.hours_text,
    deliveryInfo: profile.delivery_info,
    contactPhone: profile.contact_phone,
    infoExtra: infoExtraDraft.trim() || null,
  })
  const welcomePreview = renderBotWelcomePreview(welcomeDraft)

  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Canal WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariantForChannel(channelStatus)}>{channelLabel(channelStatus)}</Badge>
            <span className="text-xs text-muted-foreground">
              Dernier webhook : {lastWebhookAt ?? 'jamais'}
            </span>
          </div>

          {tokenError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {tokenError}
            </div>
          )}
          <form action={handleTokenSubmit} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="bot-whapi-token">Token du canal Whapi</Label>
              <Input id="bot-whapi-token" name="whapi_token" placeholder="Nouveau token" />
            </div>
            <Button type="submit" variant="outline" disabled={tokenSaving}>
              {tokenSaving ? 'Enregistrement…' : 'Enregistrer le token'}
            </Button>
            {tokenSaved && !tokenSaving && (
              <span className="text-sm text-muted-foreground">Enregistré.</span>
            )}
          </form>

          {webhookButton}
        </CardContent>
      </Card>

      {hasChannel && (
        <Card className="rounded-2xl p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="font-display text-base">Connexion du numéro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 px-0">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="pairing-phone">Numéro de téléphone</Label>
                  <Input
                    id="pairing-phone"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="24177000000"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGetPairingCode}
                  disabled={pairingLoading || !pairingPhone.trim()}
                >
                  {pairingLoading ? 'Obtention…' : "Obtenir un code d'appairage"}
                </Button>
              </div>
              {pairingError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {pairingError}
                </div>
              )}
              {pairingCode && (
                <div className="rounded-2xl border border-border bg-card p-4 text-center">
                  <p className="font-display text-3xl font-semibold tracking-[0.3em]">{pairingCode}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    WhatsApp → Réglages → Appareils connectés → Connecter avec le numéro de téléphone.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button type="button" variant="outline" onClick={handleShowQr} disabled={qrLoading} className="self-start">
                {qrLoading ? 'Chargement…' : 'Afficher le QR'}
              </Button>
              {qrError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {qrError}
                </div>
              )}
              {qrBase64 && (
                <div className="flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URI, next/image ne s'applique pas */}
                  <img
                    src={`data:image/png;base64,${qrBase64}`}
                    alt="QR de connexion WhatsApp"
                    className="h-48 w-48 rounded-xl border border-border bg-white p-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Le QR expire rapidement — cliquez pour rafraîchir.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Messages du bot</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {messagesError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {messagesError}
            </div>
          )}
          <form action={handleMessagesSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bot-welcome">Message d&apos;accueil personnalisé</Label>
              <Textarea
                id="bot-welcome"
                name="bot_welcome"
                value={welcomeDraft}
                onChange={(e) => setWelcomeDraft(e.target.value)}
                placeholder="Vide = message d'accueil par défaut"
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bot-info-extra">Infos complémentaires</Label>
              <Textarea
                id="bot-info-extra"
                name="bot_info_extra"
                value={infoExtraDraft}
                onChange={(e) => setInfoExtraDraft(e.target.value)}
                placeholder="Ex : Wifi gratuit, parking disponible…"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={messagesSaving}>
                {messagesSaving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              {messagesSaved && !messagesSaving && (
                <span className="text-sm text-muted-foreground">Enregistré.</span>
              )}
            </div>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {welcomePreview && (
              <div className="flex flex-col gap-1.5">
                <Label>Aperçu de l&apos;accueil</Label>
                <div className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-3 text-sm shadow-xs">
                  {renderWhatsappText(welcomePreview)}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Aperçu de la commande « infos »</Label>
              <div className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-3 text-sm shadow-xs">
                {renderWhatsappText(infosPreview)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
