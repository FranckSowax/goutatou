import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { planOf } from '@/lib/premium'
import { AppShell } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import type { NavItem } from '@/components/nav-links'
import { LiveAlertOverlay } from './live-alert-overlay'

const NAV = [
  { href: '/app', label: 'Accueil', icon: 'Home' },
  { href: '/app/commandes', label: 'Commandes', icon: 'ClipboardList' },
  { href: '/app/menu', label: 'Menu', icon: 'UtensilsCrossed' },
  { href: '/app/livraison', label: 'Livraison', icon: 'Bike' },
  { href: '/app/conversations', label: 'Conversations', icon: 'MessagesSquare' },
  { href: '/app/stats', label: 'Statistiques', icon: 'ChartColumn' },
  { href: '/app/marketing', label: 'Marketing', icon: 'Megaphone', match: '/app/marketing' },
  { href: '/app/fidelite', label: 'Fidélité', icon: 'Gift' },
  { href: '/app/reglages', label: 'Réglages', icon: 'Settings' },
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
    <>
      {/* Alerte cuisine plein écran, quelle que soit la page /app ouverte. Données uniquement
          (restaurantId) depuis ce Server Component — jamais de prop fonction Server→Client. */}
      {member && <LiveAlertOverlay restaurantId={member.restaurant_id} />}
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
    </>
  )
}
