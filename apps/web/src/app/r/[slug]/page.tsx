import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLpData } from '@/lib/lp/data'

export const revalidate = 120

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) return { title: 'Goutatou' }
  return {
    title: `${lp.name} — Commandez sur WhatsApp`,
    description: lp.config.hero.subtitle || `Découvrez la carte de ${lp.name} et commandez en quelques secondes.`,
    openGraph: lp.config.hero.mediaType === 'image' && lp.config.hero.mediaUrl
      ? { images: [lp.config.hero.mediaUrl] } : undefined,
  }
}

export default async function LpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  return (
    <main className="min-h-screen">
      <h1 className="p-10 text-4xl font-bold">{lp.config.hero.title}</h1>
      {/* Sections T6 */}
    </main>
  )
}
