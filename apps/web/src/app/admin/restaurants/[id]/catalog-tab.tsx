'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { setCatalogEnabled, requestCatalogSync, checkBusinessAccount } from './actions'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

function formatDateFr(iso: string | null): string {
  if (!iso) return 'jamais'
  return new Date(iso).toLocaleString('fr-FR')
}

export function CatalogTab({
  restaurantId,
  catalogEnabled,
  hasChannel,
  channelStatus,
  availableCount,
  availableWithPhotoCount,
  linkedCount,
  catalogSyncedAt,
  catalogSyncError,
}: {
  restaurantId: string
  catalogEnabled: boolean
  hasChannel: boolean
  channelStatus: string | undefined
  availableCount: number
  availableWithPhotoCount: number
  linkedCount: number
  catalogSyncedAt: string | null
  catalogSyncError: string | null
}) {
  const [checkResult, setCheckResult] = useState<{ isBusiness: boolean; phone: string | null } | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const channelActive = hasChannel && channelStatus === 'active'

  async function handleCheckBusinessAccount() {
    setChecking(true)
    setCheckError(null)
    setCheckResult(null)
    try {
      const result = await checkBusinessAccount(restaurantId)
      setCheckResult(result)
    } catch (e) {
      setCheckError(errorMessage(e, 'Impossible de contacter Whapi — le canal n’existe peut-être plus.'))
    } finally {
      setChecking(false)
    }
  }

  async function handleToggleCatalog() {
    setToggling(true)
    setToggleError(null)
    try {
      await setCatalogEnabled(restaurantId, !catalogEnabled)
    } catch (e) {
      setToggleError(errorMessage(e, 'Impossible de changer l’état du catalogue.'))
    } finally {
      setToggling(false)
    }
  }

  async function handleRequestSync() {
    setSyncing(true)
    setSyncError(null)
    setSyncMessage(null)
    try {
      await requestCatalogSync(restaurantId)
      setSyncMessage('Synchronisation demandée — effective sous une minute.')
    } catch (e) {
      setSyncError(errorMessage(e, 'Impossible de demander la synchronisation du catalogue.'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Prérequis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={!hasChannel ? 'muted' : channelActive ? 'success' : 'warning'}>
              {!hasChannel ? 'Canal absent' : channelActive ? 'Canal actif' : 'Canal désactivé'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {availableWithPhotoCount} plat{availableWithPhotoCount > 1 ? 's' : ''} avec photo sur{' '}
              {availableCount} disponible{availableCount > 1 ? 's' : ''}
            </span>
          </div>

          {checkError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {checkError}
            </div>
          )}
          {checkResult && !checkError && (
            <div
              className={
                checkResult.isBusiness
                  ? 'rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground'
                  : 'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              }
            >
              {checkResult.isBusiness
                ? `Compte Business ✓${checkResult.phone ? ` (${checkResult.phone})` : ''}`
                : 'Ce numéro n’est pas un compte WhatsApp Business — le catalogue nécessite l’app WhatsApp Business.'}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={checking || !hasChannel}
            onClick={handleCheckBusinessAccount}
          >
            {checking ? 'Vérification…' : 'Vérifier le compte WhatsApp'}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Activation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={catalogEnabled ? 'success' : 'muted'}>
              {catalogEnabled ? 'Catalogue activé' : 'Catalogue désactivé'}
            </Badge>
          </div>
          {toggleError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {toggleError}
            </div>
          )}
          <Button
            type="button"
            variant={catalogEnabled ? 'outline' : 'default'}
            className="self-start"
            disabled={toggling}
            onClick={handleToggleCatalog}
          >
            {toggling ? 'Changement…' : catalogEnabled ? 'Désactiver le catalogue' : 'Activer le catalogue'}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          <p className="text-xs text-muted-foreground">Dernière sync : {formatDateFr(catalogSyncedAt)}</p>
          <p className="text-xs text-muted-foreground">
            {linkedCount} produit{linkedCount > 1 ? 's' : ''} lié{linkedCount > 1 ? 's' : ''}
          </p>

          {catalogSyncError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {catalogSyncError}
            </div>
          )}
          {syncError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {syncError}
            </div>
          )}
          {syncMessage && !syncError && <p className="text-sm text-muted-foreground">{syncMessage}</p>}

          <Button
            type="button"
            className="self-start"
            disabled={syncing || !catalogEnabled || !hasChannel}
            onClick={handleRequestSync}
          >
            {syncing ? 'Demande…' : 'Synchroniser maintenant'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
