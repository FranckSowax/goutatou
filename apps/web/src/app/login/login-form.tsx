'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { login, loginByPhone } from './actions'

type Mode = 'owner' | 'staff'

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('owner')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-xs" role="tablist">
        {(
          [
            { key: 'owner', label: 'Patron' },
            { key: 'staff', label: 'Employé' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              'min-h-11 flex-1 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
              mode === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'owner' ? (
        <form action={login} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="email@resto.com" className="min-h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" required placeholder="Mot de passe" className="min-h-11" />
          </div>
          <Button type="submit" className="min-h-11 w-full">Se connecter</Button>
        </form>
      ) : (
        <form action={loginByPhone} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Numéro WhatsApp</Label>
            <Input id="phone" name="phone" inputMode="tel" required placeholder="077000000" className="min-h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-password">Mot de passe</Label>
            <Input
              id="staff-password"
              name="password"
              type="password"
              required
              placeholder="Mot de passe"
              className="min-h-11"
            />
          </div>
          <Button type="submit" className="min-h-11 w-full">Se connecter</Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login/mot-de-passe-oublie" className="underline underline-offset-4">
          Mot de passe oublié ?
        </Link>
      </p>
    </div>
  )
}
