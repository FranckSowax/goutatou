import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { CampaignDetail } from './detail'

export const dynamic = 'force-dynamic'

export default async function CampagneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServer()
  const { data: c } = await supabase.from('campaigns')
    .select('id, name, body, status, total_recipients, sent_count, failed_count, scheduled_at').eq('id', id).maybeSingle()
  if (!c) notFound()
  return <CampaignDetail c={c} />
}
