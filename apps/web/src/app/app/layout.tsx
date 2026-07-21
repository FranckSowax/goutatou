import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getMember } from '@/lib/member'
import { planOf } from '@/lib/premium'
import { AppShell } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { OrdersLiveProvider } from '@/components/notifications-bell'
import type { NavItem } from '@/components/nav-links'
import { LiveAlertOverlay } from './live-alert-overlay'

const NAV = [
  { href: '/app', label: 'Accueil', icon: 'Home' },
  { href: '/app/commandes', label: 'Commandes', icon: 'ClipboardList', badge: 'pendingOrders' },
  { href: '/app/menu', label: 'Menu', icon: 'UtensilsCrossed' },
  { href: '/app/livraison', label: 'Livraison', icon: 'Bike' },
  { href: '/app/conversations', label: 'Conversations', icon: 'MessagesSquare' },
  { href: '/app/clients', label: 'Clients', icon: 'Users', match: '/app/clients', separatorAfter: true },
  { href: '/app/stats', label: 'Statistiques', icon: 'ChartColumn', ownerOnly: true },
  { href: '/app/caisse', label: 'Caisse', icon: 'Wallet', match: '/app/caisse', ownerOnly: true },
  { href: '/app/analyses', label: 'Analyses', icon: 'Sparkles', match: '/app/analyses', ownerOnly: true },
  { href: '/app/marketing', label: 'Marketing', icon: 'Megaphone', match: '/app/marketing', ownerOnly: true },
  { href: '/app/fidelite', label: 'Fidélité', icon: 'Gift' },
  { href: '/app/reglages', label: 'Réglages', icon: 'Settings', ownerOnly: true },
  { href: '/app/equipe', label: 'Équipe', icon: 'UsersRound', match: '/app/equipe', ownerOnly: true },
] satisfies NavItem[]

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Garde serveur (défense en profondeur, en plus du middleware) : un utilisateur
  // non connecté est renvoyé vers /login au lieu de voir le tableau de bord vide.
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const member = await getMember(supabase)
  const [sub, pendingOrders] = await Promise.all([
    member ? planOf(supabase, member.restaurantId) : null,
    // Compte initial du badge « Commandes » : les commandes encore au statut `recue`. Le compteur
    // est ensuite tenu à jour en direct par OrdersLiveProvider (canal `orders` de la cloche).
    member
      ? supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', member.restaurantId)
          .eq('status', 'recue')
          .then(({ count }) => count ?? 0)
      : 0,
  ])
  const nav = NAV.filter((i) => !i.ownerOnly || member?.role === 'owner')

  return (
    <>
      {/* Alerte cuisine plein écran, quelle que soit la page /app ouverte. Données uniquement
          (restaurantId) depuis ce Server Component — jamais de prop fonction Server→Client. */}
      {member && <LiveAlertOverlay restaurantId={member.restaurantId} />}
      <OrdersLiveProvider restaurantId={member?.restaurantId ?? null} initialPending={pendingOrders}>
        <AppShell
          items={nav}
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
      </OrdersLiveProvider>
    </>
  )
}
