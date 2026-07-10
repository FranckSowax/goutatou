import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import type { NavItem } from '@/components/nav-links'

const NAV = [
  { href: '/admin', label: 'Restaurants', icon: 'Store' },
] satisfies NavItem[]

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!admin) redirect('/app/commandes')
  return (
    <AppShell items={NAV} title="Goutatou — Admin" userEmail={user.email}>
      {children}
    </AppShell>
  )
}
