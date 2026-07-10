import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig } from '@/lib/lp/config'
import { updateLpConfig, uploadHeroMedia } from './actions'

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
        <h2 className="text-lg font-semibold">Landing page — {resto.name}</h2>
        <a
          href={'https://goutatou.netlify.app/r/' + resto.slug}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 underline"
        >
          Prévisualiser la LP ↗
        </a>
      </div>

      <section className="rounded-lg bg-white p-4 shadow-xs">
        <h3 className="mb-3 font-semibold">Média hero</h3>
        {config.hero.mediaUrl && (
          <p className="mb-2 text-xs text-neutral-500">
            Média actuel ({config.hero.mediaType}) : <a href={config.hero.mediaUrl} target="_blank" rel="noopener noreferrer" className="underline">{config.hero.mediaUrl}</a>
          </p>
        )}
        <form action={uploadHeroMedia.bind(null, restaurantId)} className="flex items-center gap-2 text-sm">
          <input name="hero" type="file" accept="image/*,video/*" required className="rounded-sm border p-2" />
          <button className="rounded-sm bg-neutral-900 px-3 py-2 text-white">Uploader le média hero</button>
        </form>
      </section>

      <form action={updateLpConfig.bind(null, restaurantId)} className="flex flex-col gap-6 rounded-lg bg-white p-4 shadow-xs text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="published" defaultChecked={config.published} />
          Publier la landing page
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Hero</legend>
          <input name="hero_title" defaultValue={config.hero.title} placeholder="Titre" className="rounded-sm border p-2" />
          <input name="hero_subtitle" defaultValue={config.hero.subtitle} placeholder="Sous-titre" className="rounded-sm border p-2" />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Thème</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col items-start gap-1">
              Couleur principale
              <input type="color" name="theme_primary" defaultValue={config.theme.primary} />
            </label>
            <label className="flex flex-col items-start gap-1">
              Fond
              <input type="color" name="theme_bg" defaultValue={config.theme.bg} />
            </label>
            <label className="flex flex-col items-start gap-1">
              Texte
              <input type="color" name="theme_text" defaultValue={config.theme.text} />
            </label>
            <label className="flex flex-col items-start gap-1">
              Accent
              <input type="color" name="theme_accent" defaultValue={config.theme.accent} />
            </label>
          </div>
          <label className="flex flex-col items-start gap-1">
            Police
            <select name="theme_font" defaultValue={config.theme.font} className="rounded-sm border p-2">
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">À propos</legend>
          <input name="about_title" defaultValue={config.about?.title ?? ''} placeholder="Titre" className="rounded-sm border p-2" />
          <textarea name="about_text" defaultValue={config.about?.text ?? ''} placeholder="Texte (vide = section masquée)" rows={4} className="rounded-sm border p-2" />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Infos pratiques</legend>
          <input name="address" defaultValue={config.infos.address ?? ''} placeholder="Adresse" className="rounded-sm border p-2" />
          <textarea name="hours" defaultValue={config.infos.hours.join('\n')} placeholder={'Horaires (1 par ligne)'} rows={4} className="rounded-sm border p-2" />
          <input name="mapsUrl" defaultValue={config.infos.mapsUrl ?? ''} placeholder="Lien Google Maps" className="rounded-sm border p-2" />
          <input name="whatsappPhone" defaultValue={config.whatsappPhone ?? ''} placeholder="Numéro WhatsApp (ex. 24177000000)" className="rounded-sm border p-2" />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Plats mis en avant (max 4)</legend>
          {(items ?? []).length === 0 && <p className="text-neutral-500">Aucun plat pour ce restaurant.</p>}
          {(items ?? []).map((item) => (
            <label key={item.id} className="flex items-center gap-2">
              <input type="checkbox" name="featured" value={item.id} defaultChecked={config.featuredIds.includes(item.id)} />
              {item.name}
            </label>
          ))}
        </fieldset>

        <button className="rounded-sm bg-neutral-900 p-2 text-white">Enregistrer</button>
      </form>
    </div>
  )
}
