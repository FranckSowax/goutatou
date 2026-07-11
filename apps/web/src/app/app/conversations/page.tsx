import { createSupabaseServer } from '@/lib/supabase/server'
import type { ConversationCustomer, ConversationLog } from '@/lib/conversations'
import { Inbox } from './inbox'

export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 30
const LOGS_LIMIT = 800

export default async function ConversationsPage() {
  const supabase = await createSupabaseServer()

  const { data: member } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .maybeSingle()
  const restaurantId = member?.restaurant_id ?? null

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: logsData } = await supabase
    .from('message_logs')
    .select('id, direction, chat_id, body, error, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(LOGS_LIMIT)

  const { data: customersData } = await supabase
    .from('customers')
    .select('chat_id, name, phone')

  const logs: ConversationLog[] = logsData ?? []
  const customers: ConversationCustomer[] = customersData ?? []

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Conversations</h1>
      <Inbox initialLogs={logs} customers={customers} restaurantId={restaurantId} />
    </div>
  )
}
