import { notFound } from 'next/navigation'
import { getLpData } from '@/lib/lp/data'
import { CheckoutForm } from './form'

export const dynamic = 'force-dynamic'

export default async function CommanderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Votre commande</h1>
      <CheckoutForm slug={slug} driveEnabled={lp.driveEnabled} driveSlots={lp.driveSlots} />
    </main>
  )
}
