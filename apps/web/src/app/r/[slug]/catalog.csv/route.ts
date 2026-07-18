import { createAdminClient } from '@/lib/supabase/admin'
import { buildCatalogCsv, type FeedProduct } from '@/lib/lp/catalog-feed'

// Flux catalogue Meta (DPA) : lecture seule, plats DISPONIBLES uniquement, aucune donnée perso.
// Dynamique (prix frais à chaque génération, jamais figé dans l'URL).
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createAdminClient()

  const { data: resto } = await db
    .from('restaurants')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto) return new Response('Restaurant introuvable', { status: 404 })

  const { data: rows } = await db
    .from('menu_items')
    .select('id, name, description, price, photo_url, available')
    .eq('restaurant_id', resto.id)
    .eq('available', true)
    .order('position')

  const products: FeedProduct[] = (rows ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    price: i.price,
    available: i.available,
    photoUrl: i.photo_url,
  }))

  // baseUrl absolu : SITE_BASE_URL si défini, sinon dérivé de la requête.
  const baseUrl = process.env.SITE_BASE_URL ?? new URL(req.url).origin
  const csv = buildCatalogCsv(products, baseUrl, slug, resto.name)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
