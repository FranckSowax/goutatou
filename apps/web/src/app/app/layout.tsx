import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { planOf } from '@/lib/premium'
import { AppShell } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import type { NavItem } from '@/components/nav-links'

const NAV = [
  { href: '/app', label: 'Accueil', icon: 'Home' },
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

  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  const sub = member ? await planOf(supabase, member.restaurant_id) : null

  return (
    <AppShell
      items={NAV}
      title="Goutatou"
      userEmail={user.email}
      footer={sub ? (
        <div className="flex items-center justify-between gap-2">
          <span>Offre</span>
          <Badge variant="secondary" className="capitalize">{sub.plan}</Badge>
        </div>
      ) : undefined}
    >
      {children}
    </AppShell>
  )
}
