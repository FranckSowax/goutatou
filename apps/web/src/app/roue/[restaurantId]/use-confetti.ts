'use client'

// Hook confetti canvas 2D, porté de cartelle (`app/spin/[shopId]/page.tsx`) : DPR-aware,
// cap de particules, dégradé pour les préférences « reduced motion ». Purement esthétique —
// ne participe à aucune décision de tirage.
import { useCallback, useEffect, useRef } from 'react'

const CONFETTI_COLORS = ['#059669', '#0d9488', '#d97706', '#fbbf24', '#0891b2', '#65a30d']
const MAX_PARTICLES = 180

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
}

export function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number | null>(null)
  const dprRef = useRef(1)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    reducedMotionRef.current =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const setupCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    setupCanvas()
    window.addEventListener('resize', setupCanvas, { passive: true })
    return () => window.removeEventListener('resize', setupCanvas)
  }, [])

  const createParticles = useCallback((x: number, y: number, count: number) => {
    const additions: Particle[] = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = 3 + Math.random() * 5
      additions.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 4,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        size: 3 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      })
    }
    const merged = particlesRef.current.concat(additions)
    particlesRef.current = merged.length > MAX_PARTICLES ? merged.slice(merged.length - MAX_PARTICLES) : merged
  }, [])

  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cssWidth = canvas.width / dprRef.current
    const cssHeight = canvas.height / dprRef.current
    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const alive: Particle[] = []
    for (const p of particlesRef.current) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.25
      p.vx *= 0.99
      p.rotation += p.rotationSpeed
      if (p.y <= cssHeight + 50) alive.push(p)
    }
    particlesRef.current = alive

    if (alive.length > 0) {
      const byColor: Record<string, Particle[]> = {}
      for (const p of alive) (byColor[p.color] ||= []).push(p)
      for (const color in byColor) {
        ctx.fillStyle = color
        for (const p of byColor[color]) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation)
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
          ctx.restore()
        }
      }
      animationRef.current = requestAnimationFrame(animate)
    } else {
      animationRef.current = null
    }
  }, [])

  const fire = useCallback(
    (x?: number, y?: number) => {
      if (reducedMotionRef.current) return
      if (typeof window === 'undefined') return
      const cx = x ?? window.innerWidth / 2
      const cy = y ?? window.innerHeight / 3
      const isMobile = window.innerWidth < 768
      const nav = navigator as Navigator & { deviceMemory?: number }
      const isLowEnd =
        (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) ||
        (nav.deviceMemory !== undefined && nav.deviceMemory <= 2)
      const count = isLowEnd ? 15 : isMobile ? 25 : 50
      createParticles(cx, cy, count)
      if (animationRef.current === null) {
        animationRef.current = requestAnimationFrame(animate)
      }
    },
    [createParticles, animate],
  )

  useEffect(
    () => () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    },
    [],
  )

  return { canvasRef, fire }
}
