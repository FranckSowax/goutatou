import { describe, expect, it } from 'vitest'
import { onboardingDone, onboardingProgress, onboardingSteps, type OnboardingState } from '../src/lib/onboarding'

function state(partial: Partial<OnboardingState>): OnboardingState {
  return { channelReady: false, menuReady: false, orderReceived: false, ...partial }
}

describe('onboardingSteps', () => {
  it('aucune étape faite : 3 étapes, toutes done:false, ordre stable', () => {
    const steps = onboardingSteps(state({}))
    expect(steps.map((s) => s.key)).toEqual(['canal', 'carte', 'commande'])
    expect(steps.every((s) => s.done === false)).toBe(true)
  })

  it('libellés et href figés', () => {
    const steps = onboardingSteps(state({}))
    expect(steps).toEqual([
      { key: 'canal', label: 'Connectez votre WhatsApp', done: false, href: '/app/reglages' },
      { key: 'carte', label: 'Créez votre carte', done: false, href: '/app/menu' },
      { key: 'commande', label: 'Recevez votre 1re commande', done: false, href: '/app/commandes' },
    ])
  })

  it('canal + carte faits : commande reste non cochée, ordre stable', () => {
    const steps = onboardingSteps(state({ channelReady: true, menuReady: true }))
    expect(steps.map((s) => s.key)).toEqual(['canal', 'carte', 'commande'])
    expect(steps.map((s) => s.done)).toEqual([true, true, false])
  })

  it('les 3 faites : toutes cochées', () => {
    const steps = onboardingSteps(state({ channelReady: true, menuReady: true, orderReceived: true }))
    expect(steps.map((s) => s.done)).toEqual([true, true, true])
  })
})

describe('onboardingProgress', () => {
  it('aucune étape faite : 0', () => {
    expect(onboardingProgress(state({}))).toBe(0)
  })

  it('canal + carte faits : 2', () => {
    expect(onboardingProgress(state({ channelReady: true, menuReady: true }))).toBe(2)
  })

  it('les 3 faites : 3', () => {
    expect(onboardingProgress(state({ channelReady: true, menuReady: true, orderReceived: true }))).toBe(3)
  })
})

describe('onboardingDone', () => {
  it('aucune étape faite : false', () => {
    expect(onboardingDone(state({}))).toBe(false)
  })

  it('canal + carte faits (commande manquante) : false', () => {
    expect(onboardingDone(state({ channelReady: true, menuReady: true }))).toBe(false)
  })

  it('les 3 faites : true', () => {
    expect(onboardingDone(state({ channelReady: true, menuReady: true, orderReceived: true }))).toBe(true)
  })

  it('régression : carte vidée après avoir tout fait → false', () => {
    const allDone = state({ channelReady: true, menuReady: true, orderReceived: true })
    const regressed: OnboardingState = { ...allDone, menuReady: false }
    expect(onboardingDone(regressed)).toBe(false)
    expect(onboardingProgress(regressed)).toBe(2)
  })
})
