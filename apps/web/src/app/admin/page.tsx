import { decryptToken } from '@goutatou/db/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { configureWebhook, createRestaurant } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: restos } = await admin
    .from('restaurants')
    .select('id, slug, name, created_at, whapi_channels(id, token_encrypted, status, last_webhook_at)')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Nouveau restaurant</h2>
        <form action={createRestaurant} className="grid grid-cols-2 gap-2 text-sm">
          <input name="name" required placeholder="Nom du restaurant" className="rounded border p-2" />
          <input name="slug" required placeholder="slug (ex. chez-mama)" pattern="[a-z0-9-]{2,40}" className="rounded border p-2" />
          <input name="owner_email" required type="email" placeholder="Email du gérant" className="rounded border p-2" />
          <input name="owner_password" required placeholder="Mot de passe initial" className="rounded border p-2" />
          <input name="whapi_token" required placeholder="Token du canal Whapi" className="col-span-2 rounded border p-2" />
          <button className="col-span-2 rounded bg-neutral-900 p-2 text-white">Créer le restaurant</button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Restaurants ({restos?.length ?? 0})</h2>
        {(restos ?? []).map((r) => {
          const chan = (r.whapi_channels as unknown as {
            id: string; token_encrypted: string; status: string; last_webhook_at: string | null
          } | null)
          return (
            <article key={r.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{r.name}</span>
                  <span className="ml-2 text-sm text-neutral-500">/{r.slug}</span>
                </div>
                {chan && (
                  <form action={configureWebhook.bind(null, chan.id,
                    decryptToken(chan.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))}>
                    <button className="rounded border px-3 py-1 text-sm">Configurer le webhook</button>
                  </form>
                )}
              </div>
              {chan && (
                <p className="mt-1 text-xs text-neutral-500">
                  Canal : {chan.status} · Dernier webhook : {chan.last_webhook_at ?? 'jamais'} ·
                  URL : {process.env.PUBLIC_WEBHOOK_BASE_URL}/hook/{chan.id}
                </p>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
