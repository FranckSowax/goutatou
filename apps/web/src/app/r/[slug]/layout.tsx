import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getLpData } from '@/lib/lp/data'
import { SmoothScroll } from '@/components/lp/SmoothScroll'
import { Overlays } from '@/components/lp/Overlays'
import { CartProvider } from '@/components/lp/CartProvider'

export default async function LpLayout({ children, params }: {
  children: ReactNode; params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  const { theme } = lp.config
  return (
    <div
      className={theme.font === 'serif' ? 'font-serif' : 'font-sans'}
      style={{
        ['--lp-primary' as string]: theme.primary,
        ['--lp-bg' as string]: theme.bg,
        ['--lp-text' as string]: theme.text,
        ['--lp-accent' as string]: theme.accent,
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <SmoothScroll>
        <CartProvider slug={slug}>{children}</CartProvider>
      </SmoothScroll>
      <Overlays grain={lp.config.effects.grain} vignette={lp.config.effects.vignette} />
    </div>
  )
}
