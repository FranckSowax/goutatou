'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLoyaltySettings, uploadLoyaltyImage, regenerateStampCode } from './actions'

/**
 * Onglet « Carte » : activation de la carte de fidélité, cooldown anti-abus du QR de caisse,
 * branding (logo + cover) et QR de caisse imprimable/téléchargeable. Le composant importe
 * lui-même ses actions serveur (pattern qr-section.tsx) — jamais de fonction reçue en prop.
 * `qrSvg` est le QR déjà rendu côté serveur (lib/qr.ts) dans page.tsx.
 */
export function LoyaltySettings({
  enabled,
  cooldownHours,
  logoUrl,
  coverUrl,
  qrSvg,
  stampUrl,
}: {
  enabled: boolean
  cooldownHours: number
  logoUrl: string | null
  coverUrl: string | null
  qrSvg: string | null
  stampUrl: string | null
}) {
  function downloadSvg() {
    if (!qrSvg) return
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'qr-carte-fidelite.svg'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Réglages</h2>
          <Card className="rounded-2xl p-4">
            <form action={updateLoyaltySettings} className="flex flex-col gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="loyalty_enabled"
                  defaultChecked={enabled}
                  className="size-4 accent-primary"
                />
                Activer la carte de fidélité
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Label htmlFor="loyalty_cooldown_hours" className="font-normal">
                  Un tampon toutes les
                </Label>
                <Input
                  id="loyalty_cooldown_hours"
                  name="loyalty_cooldown_hours"
                  type="number"
                  min="0"
                  defaultValue={cooldownHours}
                  className="w-20"
                />
                heure(s) par client
              </div>
              <p className="text-xs text-muted-foreground">
                Empêche un même client de cumuler plusieurs tampons trop rapprochés (0 = sans délai).
              </p>
              <Button type="submit" className="w-fit">
                Enregistrer
              </Button>
            </form>
          </Card>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Branding de la carte</h2>
          <Card className="flex flex-col gap-5 rounded-2xl p-4">
            <div className="flex flex-col gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo de la carte"
                    className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-[10px] text-muted-foreground">
                    —
                  </div>
                )}
                <form action={uploadLoyaltyImage.bind(null, 'logo')} className="flex flex-1 items-center gap-2">
                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    aria-label="Logo de la carte"
                    className="min-w-0 flex-1 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Téléverser
                  </Button>
                </form>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4">
              <Label>Bannière</Label>
              <div className="flex flex-col gap-3">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt="Bannière de la carte"
                    className="aspect-16/9 w-full rounded-xl border border-border object-cover"
                  />
                ) : (
                  <div className="flex aspect-16/9 w-full items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                    Aucune bannière
                  </div>
                )}
                <form action={uploadLoyaltyImage.bind(null, 'cover')} className="flex items-center gap-2">
                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    aria-label="Bannière de la carte"
                    className="min-w-0 flex-1 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Téléverser
                  </Button>
                </form>
              </div>
            </div>
          </Card>
        </section>
      </div>

      <Card className="rounded-2xl p-4 lg:sticky lg:top-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">QR de caisse</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 px-0">
          {qrSvg ? (
            <>
              <div
                className="w-full max-w-[220px] rounded-xl bg-white p-3"
                // eslint-disable-next-line react/no-danger -- SVG généré côté serveur par qrcode, pas d'entrée utilisateur
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="text-center text-xs text-muted-foreground">
                Affichez ce QR en caisse : le client le scanne pour cumuler un tampon.
              </p>
              {stampUrl && (
                <p className="w-full truncate text-center text-xs text-muted-foreground" title={stampUrl}>
                  {stampUrl}
                </p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={downloadSvg} className="w-full">
                Télécharger (SVG)
              </Button>
              <form action={regenerateStampCode} className="w-full">
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Régénérer le code
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground">
                Régénérer invalide le QR déjà imprimé ou affiché.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">QR indisponible (configuration manquante).</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
