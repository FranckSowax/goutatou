import Link from 'next/link'
import { UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm rounded-2xl">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary mx-auto">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </span>
          <h1 className="font-display text-3xl text-primary">Goutatou</h1>
          <p className="text-sm text-muted-foreground">Connexion</p>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">Identifiants invalides.</p>}
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="email@resto.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" type="password" required placeholder="Mot de passe" />
            </div>
            <Button type="submit" className="w-full">Se connecter</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login/mot-de-passe-oublie" className="underline underline-offset-4">
              Mot de passe oublié ?
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
