'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateWheelQrSettings } from './actions'

/**
 * Section « Roue par QR » : toggle principal, 3 actions sociales (interrupteur + lien) et
 * la période de rejeu. Le composant importe lui-même l'action serveur (pattern déjà utilisé
 * par auto-channel-card.tsx) — jamais de fonction reçue en prop d'un Server Component.
 * `svg` est le QR déjà rendu côté serveur (qrSvg) dans page.tsx : jamais de fonction en prop.
 */
export function QrSection({
  wheelQrPublic,
  actionGoogle,
  actionTiktok,
  actionChannel,
  googleUrl,
  tiktokUrl,
  channelUrl,
  spinPeriodDays,
  svg,
  publicUrl,
}: {
  wheelQrPublic: boolean
  actionGoogle: boolean
  actionTiktok: boolean
  actionChannel: boolean
  googleUrl: string
  tiktokUrl: string
  channelUrl: string
  spinPeriodDays: number
  svg: string | null
  publicUrl: string | null
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Roue par QR</h2>

      <Card className="rounded-2xl p-4">
        <form action={updateWheelQrSettings} className="flex flex-col gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="wheel_qr_public"
              defaultChecked={wheelQrPublic}
              className="size-4 accent-primary"
            />
            Active la roue par QR — remplace le déclenchement après N commandes
          </label>

          <div className="flex flex-col gap-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">Actions sociales activables (au moins une, avec son lien) :</p>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="wheel_action_google"
                  defaultChecked={actionGoogle}
                  className="size-4 accent-primary"
                />
                Laisser un avis Google
              </label>
              <Input name="wheel_google_url" type="url" placeholder="https://g.page/…" defaultValue={googleUrl} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="wheel_action_tiktok"
                  defaultChecked={actionTiktok}
                  className="size-4 accent-primary"
                />
                Suivre sur TikTok
              </label>
              <Input name="wheel_tiktok_url" type="url" placeholder="https://www.tiktok.com/@…" defaultValue={tiktokUrl} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="wheel_action_channel"
                  defaultChecked={actionChannel}
                  className="size-4 accent-primary"
                />
                Rejoindre la chaîne WhatsApp
              </label>
              <Input name="wheel_channel_url" type="url" placeholder="https://whatsapp.com/channel/…" defaultValue={channelUrl} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
            <Label htmlFor="wheel_spin_period_days" className="font-normal">
              Un tour tous les
            </Label>
            <Input
              id="wheel_spin_period_days"
              name="wheel_spin_period_days"
              type="number"
              min="0"
              defaultValue={spinPeriodDays}
              className="w-20"
            />
            jour(s) par numéro (0 = illimité)
          </div>

          <Button type="submit" className="w-fit">
            Enregistrer
          </Button>
        </form>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">QR à imprimer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 px-0">
          {svg ? (
            <>
              <div
                className="w-full max-w-[220px] rounded-xl bg-white p-3"
                // eslint-disable-next-line react/no-danger -- SVG généré côté serveur par qrcode, pas d'entrée utilisateur
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {publicUrl && (
                <p className="w-full truncate text-xs text-muted-foreground" title={publicUrl}>
                  {publicUrl}
                </p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="w-full">
                Imprimer
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">QR indisponible (configuration manquante).</p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
