import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function isPremium(supabase: SupabaseClient, restaurantId: string): Promise<boolean> {
  const { data } = await supabase.from('subscriptions').select('plan, status').eq('restaurant_id', restaurantId).maybeSingle()
  return data?.plan === 'premium' && data?.status === 'active'
}

export async function assertPremium(supabase: SupabaseClient, restaurantId: string): Promise<void> {
  if (!(await isPremium(supabase, restaurantId))) {
    throw new Error('Fonctionnalité réservée au plan Premium.')
  }
}

export async function planOf(supabase: SupabaseClient, restaurantId: string): Promise<{ plan: string; status: string } | null> {
  const { data } = await supabase.from('subscriptions').select('plan, status').eq('restaurant_id', restaurantId).maybeSingle()
  return data ?? null
}

export async function isPro(supabase: SupabaseClient, restaurantId: string): Promise<boolean> {
  const s = await planOf(supabase, restaurantId)
  return !!s && s.status === 'active' && (s.plan === 'pro' || s.plan === 'premium')
}

export async function assertPlan(supabase: SupabaseClient, restaurantId: string, plans: string[]): Promise<void> {
  const s = await planOf(supabase, restaurantId)
  if (!s || s.status !== 'active' || !plans.includes(s.plan)) {
    throw new Error('Fonctionnalité non disponible dans votre offre.')
  }
}
