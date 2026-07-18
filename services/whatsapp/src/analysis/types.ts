/** Sortie structurée de l'analyse IA d'une période (shape partagée avec le web `/app/analyses`). */
export interface AiInsights {
  resume_executif: string
  demandes: string[]
  plats_preferes: string[]
  demandes_non_satisfaites: string[]
  faq: { question: string; reponse_suggeree: string }[]
  sentiment: { note: number; resume: string }
  frictions: string[]
  actions_marketing: string[]
}

export const EMPTY_INSIGHTS: AiInsights = {
  resume_executif: '',
  demandes: [],
  plats_preferes: [],
  demandes_non_satisfaites: [],
  faq: [],
  sentiment: { note: 0, resume: '' },
  frictions: [],
  actions_marketing: [],
}

export type PeriodType = 'day' | 'week' | 'month'

/** Une période à analyser : jours civils Libreville (start/end inclusifs), format YYYY-MM-DD. */
export interface Period {
  type: PeriodType
  start: string
  end: string
}

/** Chiffres clés archivés avec le rapport (le détail des KPIs est recalculé en direct côté web). */
export interface Headline {
  orders: number
  revenue: number
  conversations: number
}
