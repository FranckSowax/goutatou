import './globals.css'
import type { ReactNode } from 'react'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' })

export const metadata = { title: 'Goutatou' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${fraunces.variable} ${jakarta.variable} min-h-screen bg-background font-sans text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
