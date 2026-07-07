import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Goutatou' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  )
}
