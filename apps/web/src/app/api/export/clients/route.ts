import { createSupabaseServer } from '@/lib/supabase/server'
import { requireMember } from '@/lib/member'
import { formatYmdLibreville } from '@/lib/order-day'
import { toCsv, type CsvValue } from '@/lib/csv'
import { getClients } from '@/app/app/clients/clients-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'Nom',
  'Téléphone',
  'Nb commandes',
  'Valeur totale (FCFA)',
  'Panier moyen (FCFA)',
  'Dernière commande',
  'Opt-in marketing',
  'Note',
]

function frDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Export CSV du CRM clients. Gardé par la session : client Supabase authentifié + `requireMember`
 * (aucun accès public, aucun paramètre de restaurant accepté — le resto vient toujours du membre).
 * Les agrégats sont ceux de la page Clients (`getClients` → RPC `clients_summary`).
 */
export async function GET() {
  const supabase = await createSupabaseServer()
  let restaurantId: string
  try {
    ;({ restaurantId } = await requireMember(supabase))
  } catch {
    return new Response('Non autorisé.', { status: 401 })
  }

  const clients = await getClients(supabase, restaurantId)
  const rows: CsvValue[][] = clients.map((c) => [
    c.name ?? '',
    c.phone,
    c.ordersCount,
    c.ltv,
    c.avgBasket,
    frDateTime(c.lastOrderAt),
    c.marketingOptIn && !c.optedOut ? 'oui' : 'non',
    c.notes ?? '',
  ])

  const filename = `clients-${formatYmdLibreville(new Date())}.csv`
  return new Response(toCsv(rows, HEADERS), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
