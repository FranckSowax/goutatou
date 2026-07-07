import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Client service_role — UNIQUEMENT côté serveur (bot, server actions). Bypasse la RLS. */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
