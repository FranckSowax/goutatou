import type { WheelPrize } from '@goutatou/db/types'
import { createPrize, deletePrize, togglePrizeActive, updatePrize } from './actions'

export function Prizes({ prizes }: { prizes: WheelPrize[] }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Lots de la roue</h2>
      <ul className="flex flex-col gap-2">
        {prizes.map((prize) => (
          <li key={prize.id} className="flex items-center justify-between gap-3 border-b pb-2">
            <span className={prize.active ? '' : 'line-through opacity-50'}>{prize.label}</span>
            <form action={updatePrize.bind(null, prize.id)} className="flex items-center gap-2 text-xs">
              <input
                name="weight"
                type="number"
                min="1"
                defaultValue={prize.weight}
                className="w-16 rounded border p-1"
                aria-label="Poids"
              />
              <input
                name="stock"
                type="number"
                defaultValue={prize.stock}
                className="w-20 rounded border p-1"
                aria-label="Stock (-1 = illimité)"
              />
              <button className="rounded border px-2 py-1">Enregistrer</button>
            </form>
            <div className="flex gap-2">
              <form action={togglePrizeActive.bind(null, prize.id, !prize.active)}>
                <button className="rounded border px-2 py-1 text-xs">
                  {prize.active ? 'Désactiver' : 'Activer'}
                </button>
              </form>
              <form action={deletePrize.bind(null, prize.id)}>
                <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Suppr.</button>
              </form>
            </div>
          </li>
        ))}
        {prizes.length === 0 && <p className="opacity-60">Aucun lot pour l’instant.</p>}
      </ul>
      <form action={createPrize} className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <input name="label" required placeholder="Nom du lot" className="col-span-3 rounded border p-2" />
        <input name="weight" required type="number" min="1" defaultValue={1} placeholder="Poids" className="rounded border p-2" />
        <input name="stock" required type="number" defaultValue={-1} placeholder="Stock (-1 = illimité)" className="col-span-2 rounded border p-2" />
        <button className="col-span-3 rounded bg-neutral-900 p-2 text-white">Ajouter le lot</button>
      </form>
    </section>
  )
}
