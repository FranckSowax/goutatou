import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getLpData } from '@/lib/lp/data'
import { Hero } from '@/components/lp/Hero'
import { Featured } from '@/components/lp/Featured'
import { MenuSection } from '@/components/lp/MenuSection'
import { Infos } from '@/components/lp/Infos'
import { CartBar } from '@/components/lp/CartBar'
import { DeepLinkAdd } from '@/components/lp/DeepLinkAdd'
import { ViewContentPing } from '@/components/lp/ViewContentPing'

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
  const items = lp.categories.flatMap((c) => c.items)
  const catalogItems = items.map((i) => ({ id: i.id, name: i.name, price: i.price }))
  const menuIds = items.map((i) => i.id)
  return (
    <main className="min-h-screen">
      <ViewContentPing ids={menuIds} />
      <Suspense fallback={null}>
        <DeepLinkAdd items={catalogItems} />
      </Suspense>
      <Hero
        title={lp.config.hero.title}
        subtitle={lp.config.hero.subtitle}
        mediaUrl={lp.config.hero.mediaUrl}
        mediaType={lp.config.hero.mediaType}
        waPhone={lp.whatsappPhone}
        restaurantName={lp.name}
        frames={lp.config.hero.frames}
        isPremium={lp.isPremium}
      />
      <Featured items={lp.featured} />
      <MenuSection categories={lp.categories} />
      <Infos infos={lp.config.infos} about={lp.config.about} waPhone={lp.whatsappPhone} name={lp.name} />
      <div id="cart-anchor" aria-hidden="true" />
      <CartBar />
    </main>
  )
}
