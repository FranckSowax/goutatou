export interface OnboardingState {
  channelReady: boolean
  menuReady: boolean
  orderReceived: boolean
}

export interface OnboardingStep {
  key: 'canal' | 'carte' | 'commande'
  label: string
  done: boolean
  href: string
}

/** Ordre stable : canal, carte, commande. Libellés/href figés (spec onboarding). */
export function onboardingSteps(s: OnboardingState): OnboardingStep[] {
  return [
    { key: 'canal', label: 'Connectez votre WhatsApp', done: s.channelReady, href: '/app/reglages' },
    { key: 'carte', label: 'Créez votre carte', done: s.menuReady, href: '/app/menu' },
    { key: 'commande', label: 'Recevez votre 1re commande', done: s.orderReceived, href: '/app/commandes' },
  ]
}

export function onboardingProgress(s: OnboardingState): number {
  return onboardingSteps(s).filter((step) => step.done).length
}

export function onboardingDone(s: OnboardingState): boolean {
  return onboardingSteps(s).every((step) => step.done)
}
