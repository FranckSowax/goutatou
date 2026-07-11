'use client'
import { useRef } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { buildWaLink } from '@/lib/lp/wa'
import { HeroScrub } from '@/components/lp/HeroScrub'
import type { LpHeroFrames } from '@/lib/lp/config'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function Hero({ title, subtitle, mediaUrl, mediaType, waPhone, restaurantName, frames }: {
  title: string; subtitle: string; mediaUrl: string | null
  mediaType: 'image' | 'video'; waPhone: string | null; restaurantName: string
  frames?: LpHeroFrames | null
}) {
  if (frames?.status === 'ready' && frames.count > 0) {
    return (
      <HeroScrub
        frames={frames}
        title={title}
        subtitle={subtitle}
        waPhone={waPhone}
        restaurantName={restaurantName}
      />
    )
  }

  return (
    <HeroFallback
      title={title}
      subtitle={subtitle}
      mediaUrl={mediaUrl}
      mediaType={mediaType}
      waPhone={waPhone}
      restaurantName={restaurantName}
    />
  )
}

function HeroFallback({ title, subtitle, mediaUrl, mediaType, waPhone, restaurantName }: {
  title: string; subtitle: string; mediaUrl: string | null
  mediaType: 'image' | 'video'; waPhone: string | null; restaurantName: string
}) {
  const root = useRef<HTMLElement>(null)
  const media = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('[data-hero-line]', { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: 'power3.out', delay: 0.2 })
    gsap.to(media.current, {
      yPercent: 18, scale: 1.08, ease: 'none',
      scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
    })
  }, [])

  return (
    <section ref={root} className="relative flex h-[92svh] items-end overflow-hidden">
      <div ref={media} className="absolute inset-0">
        {mediaUrl && mediaType === 'video' ? (
          <video src={mediaUrl} autoPlay muted loop playsInline preload="metadata"
            className="h-full w-full object-cover" />
        ) : mediaUrl ? (
          <Image src={mediaUrl} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: 'linear-gradient(160deg, var(--lp-primary), var(--lp-bg) 70%)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lp-bg) 4%, transparent 60%)' }} />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-16">
        <h1 data-hero-line className="text-5xl font-extrabold leading-tight md:text-7xl">{title}</h1>
        {subtitle && <p data-hero-line className="mt-4 max-w-xl text-lg opacity-85">{subtitle}</p>}
        <div data-hero-line className="mt-8 flex flex-wrap gap-3">
          {waPhone && (
            <a href={buildWaLink(waPhone, `Bonjour ${restaurantName} ! Je voudrais commander 🙏`)}
              className="rounded-full px-6 py-3 font-semibold text-white shadow-lg"
              style={{ backgroundColor: '#25D366' }}>
              💬 Commander sur WhatsApp
            </a>
          )}
          <a href="#carte" className="rounded-full border px-6 py-3 font-semibold"
            style={{ borderColor: 'var(--lp-accent)', color: 'var(--lp-accent)' }}>
            Voir la carte
          </a>
        </div>
      </div>
    </section>
  )
}
