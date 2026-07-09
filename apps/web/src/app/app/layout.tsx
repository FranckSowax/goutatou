import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Garde serveur (défense en profondeur, en plus du middleware) : un utilisateur
  // non connecté est renvoyé vers /login au lieu de voir le tableau de bord vide.
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-6 border-b bg-white px-6 py-3">
        <span className="font-bold">Goutatou</span>
        <Link href="/app/commandes" className="text-sm hover:underline">Commandes</Link>
        <Link href="/app/menu" className="text-sm hover:underline">Menu</Link>
        <Link href="/app/campagnes" className="text-sm hover:underline">Campagnes</Link>
        <Link href="/app/fidelite" className="text-sm hover:underline">Fidélité</Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
