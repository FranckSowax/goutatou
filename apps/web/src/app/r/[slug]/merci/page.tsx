import Link from 'next/link'
import { formatFcfa } from '@goutatou/db/types'
import { PurchasePing } from '@/components/lp/PurchasePing'

export default async function MerciPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ n?: string; t?: string }>
}) {
  const { slug } = await params
  const { n, t } = await searchParams
  // Montant réel de la commande : `t` = total calculé côté serveur (order.total), transmis par le
  // formulaire de commande dans la query. Purchase émis avec cette valeur, jamais une valeur bidon.
  const purchaseValue = t != null ? Number(t) : NaN
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <PurchasePing value={purchaseValue} orderKey={n ?? null} />
      <p className="text-6xl">✅</p>
      <h1 className="text-3xl font-bold">Commande n°{n} confirmée !</h1>
      {t && <p className="opacity-80">Total à régler à la remise : <strong>{formatFcfa(Number(t))}</strong></p>}
      <p className="opacity-70">Vous recevrez le suivi de votre commande sur WhatsApp. 🙏</p>
      <Link href={`/r/${slug}`} className="mt-4 underline opacity-70">← Retour à la carte</Link>
    </main>
  )
}
