import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig } from '@/lib/lp/config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateLpConfig } from './actions'
import { HeroUpload } from './hero-upload'

export const dynamic = 'force-dynamic'

export default async function LpEditorPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params
  const admin = createAdminClient()
  const { data: resto, error } = await admin
    .from('restaurants')
    .select('id, slug, name, lp_config')
    .eq('id', restaurantId)
    .single()
  if (error || !resto) throw new Error(`Restaurant introuvable : ${error?.message}`)

  const { data: items } = await admin
    .from('menu_items')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .order('name')

  const config = parseLpConfig(resto.lp_config, resto.name)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h2 className="font-display text-lg font-semibold">Landing page — {resto.name}</h2>
        <a
          href={'https://goutatou.netlify.app/r/' + resto.slug}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary underline underline-offset-4"
        >
          Prévisualiser la LP ↗
        </a>
      </div>

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Média hero</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-0">
          {config.hero.mediaUrl && (
            <p className="text-xs text-muted-foreground">
              Média actuel ({config.hero.mediaType}) :{' '}
              <a
                href={config.hero.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {config.hero.mediaUrl}
              </a>
            </p>
          )}
          <HeroUpload restaurantId={restaurantId} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-4">
        <form action={updateLpConfig.bind(null, restaurantId)} className="flex flex-col gap-6">
          <Label className="flex w-fit items-center gap-2">
            <input type="checkbox" name="published" defaultChecked={config.published} className="size-4 accent-primary" />
            Publier la landing page
          </Label>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-display font-semibold">Hero</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-hero-title">Titre</Label>
              <Input id="lp-hero-title" name="hero_title" defaultValue={config.hero.title} placeholder="Titre" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-hero-subtitle">Sous-titre</Label>
              <Input id="lp-hero-subtitle" name="hero_subtitle" defaultValue={config.hero.subtitle} placeholder="Sous-titre" />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-display font-semibold">Thème</legend>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col items-start gap-1.5">
                <Label htmlFor="lp-theme-primary">Couleur principale</Label>
                <input
                  id="lp-theme-primary"
                  type="color"
                  name="theme_primary"
                  defaultValue={config.theme.primary}
                  className="h-8 w-14 rounded-lg border border-input"
                />
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <Label htmlFor="lp-theme-bg">Fond</Label>
                <input
                  id="lp-theme-bg"
                  type="color"
                  name="theme_bg"
                  defaultValue={config.theme.bg}
                  className="h-8 w-14 rounded-lg border border-input"
                />
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <Label htmlFor="lp-theme-text">Texte</Label>
                <input
                  id="lp-theme-text"
                  type="color"
                  name="theme_text"
                  defaultValue={config.theme.text}
                  className="h-8 w-14 rounded-lg border border-input"
                />
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <Label htmlFor="lp-theme-accent">Accent</Label>
                <input
                  id="lp-theme-accent"
                  type="color"
                  name="theme_accent"
                  defaultValue={config.theme.accent}
                  className="h-8 w-14 rounded-lg border border-input"
                />
              </div>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <Label htmlFor="lp-theme-font">Police</Label>
              <Select name="theme_font" defaultValue={config.theme.font}>
                <SelectTrigger id="lp-theme-font">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sans">Sans</SelectItem>
                  <SelectItem value="serif">Serif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-display font-semibold">À propos</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-about-title">Titre</Label>
              <Input id="lp-about-title" name="about_title" defaultValue={config.about?.title ?? ''} placeholder="Titre" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-about-text">Texte (vide = section masquée)</Label>
              <Textarea
                id="lp-about-text"
                name="about_text"
                defaultValue={config.about?.text ?? ''}
                placeholder="Texte (vide = section masquée)"
                rows={4}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-display font-semibold">Infos pratiques</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-address">Adresse</Label>
              <Input id="lp-address" name="address" defaultValue={config.infos.address ?? ''} placeholder="Adresse" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-hours">Horaires (1 par ligne)</Label>
              <Textarea
                id="lp-hours"
                name="hours"
                defaultValue={config.infos.hours.join('\n')}
                placeholder={'Horaires (1 par ligne)'}
                rows={4}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-maps-url">Lien Google Maps</Label>
              <Input id="lp-maps-url" name="mapsUrl" defaultValue={config.infos.mapsUrl ?? ''} placeholder="Lien Google Maps" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-whatsapp-phone">Numéro WhatsApp</Label>
              <Input
                id="lp-whatsapp-phone"
                name="whatsappPhone"
                defaultValue={config.whatsappPhone ?? ''}
                placeholder="Numéro WhatsApp (ex. 24177000000)"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-display font-semibold">Plats mis en avant (max 4)</legend>
            {(items ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun plat pour ce restaurant.</p>}
            {(items ?? []).map((item) => (
              <Label key={item.id} className="flex w-fit items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  name="featured"
                  value={item.id}
                  defaultChecked={config.featuredIds.includes(item.id)}
                  className="size-4 accent-primary"
                />
                {item.name}
              </Label>
            ))}
          </fieldset>

          <Button type="submit" className="self-start">
            Enregistrer
          </Button>
        </form>
      </Card>
    </div>
  )
}
