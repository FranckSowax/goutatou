import { UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoginForm } from './login-form'

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
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  )
}
