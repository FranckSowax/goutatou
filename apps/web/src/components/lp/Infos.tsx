import { Reveal } from './Reveal'
import { buildWaLink } from '@/lib/lp/wa'
import type { LpConfig } from '@/lib/lp/config'

export function Infos({ infos, about, waPhone, name }: {
  infos: LpConfig['infos']; about: LpConfig['about']; waPhone: string | null; name: string
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-28 pt-4">
      {about && (
        <Reveal className="mb-14">
          <h2 className="mb-4 text-3xl font-bold">{about.title}</h2>
          <p className="leading-relaxed opacity-80">{about.text}</p>
        </Reveal>
      )}
      <Reveal>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-xl font-bold">Infos pratiques</h2>
          {infos.address && <p className="opacity-80">📍 {infos.address}</p>}
          {infos.hours.map((h) => <p key={h} className="opacity-80">🕐 {h}</p>)}
          <div className="mt-5 flex flex-wrap gap-3">
            {waPhone && (
              <a href={buildWaLink(waPhone, `Bonjour ${name} !`)}
                className="rounded-full px-5 py-2 font-semibold text-white" style={{ backgroundColor: '#25D366' }}>
                💬 WhatsApp
              </a>
            )}
            {infos.mapsUrl && (
              <a href={infos.mapsUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-full border px-5 py-2 font-semibold"
                style={{ borderColor: 'var(--lp-accent)', color: 'var(--lp-accent)' }}>
                🗺️ Itinéraire
              </a>
            )}
          </div>
        </div>
        <p className="mt-10 text-center text-xs opacity-40">Propulsé par Goutatou</p>
      </Reveal>
    </section>
  )
}
