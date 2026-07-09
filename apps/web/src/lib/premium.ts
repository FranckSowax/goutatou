import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function isPremium(supabase: SupabaseClient, restaurantId: string): Promise<boolean> {
  const { data } = await supabase.from('subscriptions').select('plan').eq('restaurant_id', restaurantId).maybeSingle()
  return data?.plan === 'premium'
}

export async function assertPremium(supabase: SupabaseClient, restaurantId: string): Promise<void> {
  if (!(await isPremium(supabase, restaurantId))) {
    throw new Error('Fonctionnalité réservée au plan Premium.')
  }
}
