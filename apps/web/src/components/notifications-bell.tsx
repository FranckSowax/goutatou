'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotificationsBell() {
  const router = useRouter()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel('orders-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        setCount((c) => c + 1)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={count > 0 ? `${count} nouvelle${count > 1 ? 's' : ''} commande${count > 1 ? 's' : ''}` : 'Notifications'}
      onClick={() => {
        setCount(0)
        router.push('/app/commandes')
      }}
    >
      <Bell className="size-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  )
}
