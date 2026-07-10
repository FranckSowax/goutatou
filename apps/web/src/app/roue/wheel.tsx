'use client'
import { useState } from 'react'
import { targetRotationDeg } from '@/lib/wheel'

export function Wheel({ token, labels }: { token: string; labels: string[] }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{ label: string; code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function spin() {
    if (spinning || result) return
    setSpinning(true); setError(null)
    const res = await fetch('/api/roue/spin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Erreur'); setSpinning(false); return }
    const idx = Math.max(0, labels.indexOf(json.label))
    setRotation(targetRotationDeg(idx, labels.length || 1, 6))
    setTimeout(() => { setResult({ label: json.label, code: json.code }); setSpinning(false) }, 4200)
  }

  const sector = 360 / (labels.length || 1)
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-72 w-72">
        <div className="absolute left-1/2 top-0 z-10 -ml-2 h-0 w-0 border-x-8 border-t-16 border-x-transparent border-t-yellow-400" />
        <div className="h-full w-full rounded-full border-4 border-yellow-400 transition-transform duration-4000 ease-out"
          style={{ transform: `rotate(${rotation}deg)`,
            background: `conic-gradient(${labels.map((_, i) => `hsl(${(i * 360) / (labels.length || 1)},70%,45%) ${i * sector}deg ${(i + 1) * sector}deg`).join(',')})` }}>
        </div>
      </div>
      {!result && (
        <button onClick={spin} disabled={spinning}
          className="rounded-full bg-yellow-400 px-8 py-3 font-bold text-neutral-900 disabled:opacity-50">
          {spinning ? 'La roue tourne…' : 'Tourner la roue !'}
        </button>
      )}
      {error && <p className="text-red-400">{error}</p>}
      {result && (
        <div className="rounded-2xl bg-white/10 p-6 text-center">
          <p className="text-lg">Vous avez gagné :</p>
          <p className="my-2 text-2xl font-bold text-yellow-400">{result.label}</p>
          <p className="opacity-80">Votre code : <span className="font-mono font-bold">{result.code}</span></p>
          <p className="mt-2 text-sm opacity-60">Présentez ce code au restaurant. Envoyé aussi sur votre WhatsApp.</p>
        </div>
      )}
    </div>
  )
}
