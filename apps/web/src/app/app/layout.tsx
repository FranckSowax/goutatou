import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import type { NavItem } from '@/components/nav-links'

const NAV = [
  { href: '/app/commandes', label: 'Commandes', icon: 'ClipboardList' },
  { href: '/app/menu', label: 'Menu', icon: 'UtensilsCrossed' },
  { href: '/app/campagnes', label: 'Campagnes', icon: 'Megaphone' },
  { href: '/app/fidelite', label: 'Fidélité', icon: 'Gift' },
  { href: '/app/statuts', label: 'Statuts', icon: 'Camera' },
] satisfies NavItem[]

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Garde serveur (défense en profondeur, en plus du middleware) : un utilisateur
  // non connecté est renvoyé vers /login au lieu de voir le tableau de bord vide.
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <AppShell items={NAV} title="Goutatou">
      {children}
    </AppShell>
  )
}
