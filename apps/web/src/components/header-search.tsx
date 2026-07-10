'use client'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
export function HeaderSearch() {
  const router = useRouter()
  return (
    <form className="relative w-full max-w-md" onSubmit={(e) => {
      e.preventDefault()
      const q = new FormData(e.currentTarget).get('q')?.toString().trim() ?? ''
      router.push(q ? `/app/commandes?q=${encodeURIComponent(q)}` : '/app/commandes')
    }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input name="q" placeholder="Rechercher une commande…" className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </form>
  )
}
