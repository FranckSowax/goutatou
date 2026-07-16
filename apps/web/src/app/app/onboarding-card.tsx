import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { OnboardingStep } from '@/lib/onboarding'

/**
 * Carte « Démarrez en 3 étapes » de l'Accueil — auto-déduite des données réelles (aucun état
 * stocké). Montée par app/page.tsx tant que `!onboardingDone(...)` ; réapparaît d'elle-même si
 * l'état régresse (ex. le resto vide sa carte).
 */
export function OnboardingCard({ steps, progress }: { steps: OnboardingStep[]; progress: number }) {
  return (
    <Card className="rounded-2xl border-primary/30 bg-accent/40 p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Démarrez en 3 étapes</h2>
        <span className="text-sm font-medium text-muted-foreground">{progress}/3</span>
      </div>
      <ul className="flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              <div className="-mx-2 flex items-center gap-2.5 px-2 py-1.5 text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <span className="text-sm line-through">{step.label}</span>
              </div>
            ) : (
              <Link
                href={step.href}
                className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-medium transition-colors hover:bg-accent/60"
              >
                <Circle className="size-4 shrink-0 text-primary" />
                <span className="text-sm">{step.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
