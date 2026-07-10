import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
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
        </CardContent>
      </Card>
    </main>
  )
}
