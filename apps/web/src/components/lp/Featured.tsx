import Image from 'next/image'
import { formatFcfa } from '@goutatou/db/types'
import { Reveal } from './Reveal'
import type { LpMenuItem } from '@/lib/lp/data'

export function Featured({ items }: { items: LpMenuItem[] }) {
  if (!items.length) return null
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <Reveal><h2 className="mb-10 text-3xl font-bold md:text-4xl">Nos incontournables</h2></Reveal>
      <div className="grid gap-5 md:grid-cols-3">
        {items.map((it, i) => (
          <Reveal key={it.id} delay={i * 0.08}>
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
              {it.photoUrl && (
                <div className="relative h-44">
                  <Image src={it.photoUrl} alt={it.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                </div>
              )}
              <div className="p-5">
                <h3 className="text-lg font-semibold">{it.name}</h3>
                {it.description && <p className="mt-1 text-sm opacity-70">{it.description}</p>}
                <p className="mt-3 font-bold" style={{ color: 'var(--lp-accent)' }}>{formatFcfa(it.price)}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
