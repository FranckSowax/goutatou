import { createSupabaseServer } from '@/lib/supabase/server'
import { requireMember } from '@/lib/member'
import { dayBoundsUtc, formatYmdLibreville, isValidYmd } from '@/lib/order-day'
import { toCsv, type CsvValue } from '@/lib/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = [
  'N° commande',
  'Date/heure',
  'Statut',
  'Mode',
  'Méthode de paiement',
  'Statut du paiement',
  'Total (FCFA)',
  'Client',
  'Téléphone',
]

/** Plafond de sécurité : un export reste une extraction, pas un dump complet de la base. */
const MAX_ROWS = 5000

function frDateTime(iso: string): string {
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
 * Export CSV des commandes sur une période `?from=YYYY-MM-DD&to=YYYY-MM-DD` (bornes incluses, jour
 * civil de Libreville). Sans paramètre — ou avec des dates invalides — la période est la journée en
 * cours. Gardé par la session : client Supabase authentifié + `requireMember` ; la RLS tenant
 * restreint de toute façon les lignes au restaurant du membre.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServer()
  let restaurantId: string
  try {
    ;({ restaurantId } = await requireMember(supabase))
  } catch {
    return new Response('Non autorisé.', { status: 401 })
  }

  const url = new URL(req.url)
  const today = formatYmdLibreville(new Date())
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  let from = isValidYmd(fromParam) ? fromParam : today
  let to = isValidYmd(toParam) ? toParam : today
  if (from > to) [from, to] = [to, from]

  const { startUtc } = dayBoundsUtc(from)
  const { endUtc } = dayBoundsUtc(to)

  const { data, error } = await supabase
    .from('orders')
    .select('order_number, created_at, status, mode, payment_method, payment_status, total, customers(name, phone)')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  if (error) return new Response('Export impossible.', { status: 500 })

  const rows: CsvValue[][] = (data ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string | null; phone: string } | null
    return [
      o.order_number as number,
      frDateTime(o.created_at as string),
      (o.status as string) ?? '',
      (o.mode as string) ?? '',
      (o.payment_method as string | null) ?? '',
      (o.payment_status as string | null) ?? '',
      Number(o.total ?? 0),
      customer?.name ?? '',
      customer?.phone ?? '',
    ]
  })

  const filename = from === to ? `commandes-${from}.csv` : `commandes-${from}_${to}.csv`
  return new Response(toCsv(rows, HEADERS), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
