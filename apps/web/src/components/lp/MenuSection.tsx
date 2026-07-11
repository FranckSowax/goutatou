'use client'
import { formatFcfa } from '@goutatou/db/types'
import { Reveal } from './Reveal'
import { AddToCartButton } from './AddToCartButton'
import type { LpData } from '@/lib/lp/data'

export function MenuSection({ categories }: { categories: LpData['categories'] }) {
  return (
    <section id="carte" className="mx-auto max-w-3xl px-6 py-20">
      <Reveal><h2 className="mb-10 text-3xl font-bold md:text-4xl">La carte</h2></Reveal>
      {categories.map((cat) => (
        <Reveal key={cat.id} className="mb-10">
          <h3 className="mb-4 text-xl font-semibold uppercase tracking-wide" style={{ color: 'var(--lp-accent)' }}>
            {cat.name}
          </h3>
          <ul className="flex flex-col gap-4">
            {cat.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                <div>
                  <p className="font-medium">{it.name}</p>
                  {it.description && <p className="text-sm opacity-60">{it.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap font-semibold">{formatFcfa(it.price)}</span>
                  <AddToCartButton item={it} />
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      ))}
    </section>
  )
}
