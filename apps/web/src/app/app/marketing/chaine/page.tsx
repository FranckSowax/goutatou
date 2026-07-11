import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function ChaineWhatsAppPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 font-display text-2xl font-semibold">Chaîne WhatsApp</h1>
      <Card className="rounded-2xl p-6 text-center">
        <p className="font-display text-lg font-semibold">Bientôt disponible</p>
        <p className="mt-2 text-sm text-muted-foreground">
          La gestion de votre chaîne WhatsApp arrive prochainement.
        </p>
      </Card>
    </div>
  )
}
