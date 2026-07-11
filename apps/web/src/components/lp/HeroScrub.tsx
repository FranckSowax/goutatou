'use client'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { buildWaLink } from '@/lib/lp/wa'
import type { LpHeroFrames } from '@/lib/lp/config'

gsap.registerPlugin(ScrollTrigger, useGSAP)

function frameUrl(baseUrl: string, index: number): string {
  return `${baseUrl}f-${String(index).padStart(4, '0')}.webp`
}

function HeroOverlay({ title, subtitle, waPhone, restaurantName }: {
  title: string; subtitle: string; waPhone: string | null; restaurantName: string
}) {
  return (
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
  )
}

export function HeroScrub({ frames, title, subtitle, waPhone, restaurantName }: {
  frames: LpHeroFrames; title: string; subtitle: string
  waPhone: string | null; restaurantName: string
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imagesRef = useRef<(HTMLImageElement | undefined)[]>([])
  const loadedRef = useRef<boolean[]>([])
  const currentIndexRef = useRef(1)
  const [reducedMotion, setReducedMotion] = useState(false)

  useGSAP(() => {
    if (reducedMotion) return
    gsap.fromTo('[data-hero-line]', { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: 'power3.out', delay: 0.2 })
  }, [reducedMotion])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setReducedMotion(true)
      return
    }

    const count = frames.count
    const canvas = canvasRef.current
    if (!canvas || count <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const aspect = frames.width > 0 && frames.height > 0 ? frames.width / frames.height : 16 / 9

    imagesRef.current = new Array(count + 1)
    loadedRef.current = new Array(count + 1).fill(false)

    function drawCover(img: HTMLImageElement) {
      if (!ctx) return
      const cw = canvas!.width
      const ch = canvas!.height
      const iw = img.naturalWidth || Math.round(ch * aspect)
      const ih = img.naturalHeight || ch
      if (!cw || !ch || !iw || !ih) return
      const scale = Math.max(cw / iw, ch / ih)
      const sw = cw / scale
      const sh = ch / scale
      const sx = (iw - sw) / 2
      const sy = (ih - sh) / 2
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
    }

    function draw(index: number) {
      let i = index
      while (i >= 1 && !loadedRef.current[i]) i--
      if (i < 1) {
        i = index
        while (i <= count && !loadedRef.current[i]) i++
      }
      if (i < 1 || i > count) return
      const img = imagesRef.current[i]
      if (!img) return
      drawCover(img)
    }

    function loadFrame(i: number) {
      if (i < 1 || i > count || imagesRef.current[i]) return
      const img = new window.Image()
      imagesRef.current[i] = img
      img.onload = () => {
        loadedRef.current[i] = true
        if (i === currentIndexRef.current) draw(i)
      }
      img.src = frameUrl(frames.baseUrl, i)
    }

    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(window.innerWidth * dpr)
      canvas!.height = Math.round(window.innerHeight * dpr)
      draw(currentIndexRef.current)
    }

    resizeCanvas()

    // Preload: frame 1 immediately, then every 4th frame.
    loadFrame(1)
    for (let i = 4; i <= count; i += 4) loadFrame(i)

    // Lazily load the remaining frames in the background.
    let cancelled = false
    const idle = (cb: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number }
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb)
      else setTimeout(cb, 50)
    }
    function loadRest() {
      const remaining: number[] = []
      for (let i = 1; i <= count; i++) if (!imagesRef.current[i]) remaining.push(i)
      let idx = 0
      function step() {
        if (cancelled || idx >= remaining.length) return
        loadFrame(remaining[idx])
        idx += 1
        idle(step)
      }
      step()
    }
    idle(loadRest)

    const trigger = ScrollTrigger.create({
      trigger: outerRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const idx = Math.min(count, Math.max(1, Math.round(self.progress * (count - 1)) + 1))
        currentIndexRef.current = idx
        draw(idx)
      },
    })

    const onResize = () => resizeCanvas()
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      trigger.kill()
      window.removeEventListener('resize', onResize)
      imagesRef.current = []
      loadedRef.current = []
    }
  }, [frames])

  if (reducedMotion) {
    return (
      <section className="relative flex h-screen items-end overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frameUrl(frames.baseUrl, 1)} alt=""
          className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lp-bg) 4%, transparent 60%)' }} />
        <HeroOverlay title={title} subtitle={subtitle} waPhone={waPhone} restaurantName={restaurantName} />
      </section>
    )
  }

  return (
    <div ref={outerRef} className="relative h-[250vh]">
      <div className="sticky top-0 flex h-screen items-end overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lp-bg) 4%, transparent 60%)' }} />
        <HeroOverlay title={title} subtitle={subtitle} waPhone={waPhone} restaurantName={restaurantName} />
      </div>
    </div>
  )
}
