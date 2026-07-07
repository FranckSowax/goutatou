import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!admin) redirect('/app/commandes')
  return (
    <div className="min-h-screen">
      <nav className="border-b bg-neutral-900 px-6 py-3 text-white">Goutatou — Admin plateforme</nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
