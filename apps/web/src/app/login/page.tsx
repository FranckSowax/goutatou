import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Goutatou — Connexion</h1>
      {error && <p className="text-sm text-red-600">Identifiants invalides.</p>}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="email@resto.com" className="rounded-sm border p-2" />
        <input name="password" type="password" required placeholder="Mot de passe" className="rounded-sm border p-2" />
        <button className="rounded-sm bg-neutral-900 p-2 text-white">Se connecter</button>
      </form>
    </main>
  )
}
