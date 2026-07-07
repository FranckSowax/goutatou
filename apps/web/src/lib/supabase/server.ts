import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* appelé depuis un Server Component : ignoré, le middleware rafraîchit */ }
        },
      },
    },
  )
}
