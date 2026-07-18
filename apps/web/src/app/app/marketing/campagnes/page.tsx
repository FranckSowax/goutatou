import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/**
 * Page « Campagnes » masquée en attendant son redesign complet : l'onglet est retiré
 * (marketing-tabs.tsx) et tout accès direct à l'URL est renvoyé vers Statuts. La logique
 * existante (chargement, board, actions) reste dans `board.tsx` / `actions.ts` — base du
 * futur redesign ; l'implémentation précédente de cette page reste dans l'historique git.
 */
export default async function CampagnesPage() {
  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  redirect('/app/marketing/statuts')
}
