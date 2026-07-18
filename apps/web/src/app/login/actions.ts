'use server'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { staffEmailFromPhone } from '@/lib/staff-email'

export async function login(formData: FormData) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })
  if (error) redirect('/login?error=1')
  redirect('/app')
}

/**
 * Connexion employé par numéro WhatsApp + mot de passe : l'email technique déterministe
 * (`wa-<digits>@staff.goutatou.app`) est dérivé du numéro, jamais exposé à l'utilisateur.
 */
export async function loginByPhone(formData: FormData) {
  const email = staffEmailFromPhone(String(formData.get('phone') ?? ''))
  if (!email) redirect('/login?error=1')
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get('password')),
  })
  if (error) redirect('/login?error=1')
  redirect('/app')
}
