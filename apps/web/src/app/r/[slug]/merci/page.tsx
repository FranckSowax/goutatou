import Link from 'next/link'
import { formatFcfa } from '@goutatou/db/types'

export default async function MerciPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ n?: string; t?: string }>
}) {
  const { slug } = await params
  const { n, t } = await searchParams
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl">✅</p>
      <h1 className="text-3xl font-bold">Commande n°{n} confirmée !</h1>
      {t && <p className="opacity-80">Total à régler à la remise : <strong>{formatFcfa(Number(t))}</strong></p>}
      <p className="opacity-70">Vous recevrez le suivi de votre commande sur WhatsApp. 🙏</p>
      <Link href={`/r/${slug}`} className="mt-4 underline opacity-70">← Retour à la carte</Link>
    </main>
  )
}
