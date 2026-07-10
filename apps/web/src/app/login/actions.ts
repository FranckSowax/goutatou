'use server'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })
  if (error) redirect('/login?error=1')
  redirect('/app')
}
