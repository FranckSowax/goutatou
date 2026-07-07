import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-6 border-b bg-white px-6 py-3">
        <span className="font-bold">Goutatou</span>
        <Link href="/app/commandes" className="text-sm hover:underline">Commandes</Link>
        <Link href="/app/menu" className="text-sm hover:underline">Menu</Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
