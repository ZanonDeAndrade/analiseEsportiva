export type BillingProductKey = 'brasileirao' | 'todas-ligas'
export type BillingPlanKey = BillingProductKey | 'brasileirao-anual' | 'todas-ligas-anual'

export interface BillingPlanCatalogItem {
  planKey: BillingPlanKey
  productKey: BillingProductKey
  name: string
  description: string
  priceMinor: number
  monthlyEquivalentMinor: number
  savingsMinor: number
  currency: 'BRL'
  interval: 'month' | 'year'
  recommended: boolean
  features: string[]
  entitlements: {
    leagueIds: string[]
    leagueScope: 'brasileirao' | 'all'
    analyses: true
    modelProvenance: true
  }
}

/**
 * Catálogo comercial autoritativo do servidor. Checkout e controle de acesso
 * devem resolver o planKey contra este catálogo; o frontend apenas apresenta.
 * priceMinor representa o valor efetivamente cobrado no período. Nos planos
 * anuais, monthlyEquivalentMinor existe somente para apresentação transparente.
 * Política de reembolso, tributos e textos contratuais exigem validação profissional.
 */
export const BILLING_PLAN_CATALOG: readonly BillingPlanCatalogItem[] = [
  {
    planKey: 'brasileirao',
    productKey: 'brasileirao',
    name: 'Plano Brasileirão',
    description: 'Para acompanhar exclusivamente o Brasileirão Série A.',
    priceMinor: 1_990,
    monthlyEquivalentMinor: 1_990,
    savingsMinor: 0,
    currency: 'BRL',
    interval: 'month',
    recommended: false,
    features: brazilFeatures(),
    entitlements: brazilEntitlements(),
  },
  {
    planKey: 'todas-ligas',
    productKey: 'todas-ligas',
    name: 'Plano Todas as Ligas',
    description: 'Acesso completo a todas as competições disponíveis na plataforma.',
    priceMinor: 3_990,
    monthlyEquivalentMinor: 3_990,
    savingsMinor: 0,
    currency: 'BRL',
    interval: 'month',
    recommended: true,
    features: allLeaguesFeatures(),
    entitlements: allLeaguesEntitlements(),
  },
  {
    planKey: 'brasileirao-anual',
    productKey: 'brasileirao',
    name: 'Plano Brasileirão',
    description: 'Para acompanhar exclusivamente o Brasileirão Série A.',
    priceMinor: 17_880,
    monthlyEquivalentMinor: 1_490,
    savingsMinor: 6_000,
    currency: 'BRL',
    interval: 'year',
    recommended: false,
    features: brazilFeatures(),
    entitlements: brazilEntitlements(),
  },
  {
    planKey: 'todas-ligas-anual',
    productKey: 'todas-ligas',
    name: 'Plano Todas as Ligas',
    description: 'Acesso completo a todas as competições disponíveis na plataforma.',
    priceMinor: 41_880,
    monthlyEquivalentMinor: 3_490,
    savingsMinor: 6_000,
    currency: 'BRL',
    interval: 'year',
    recommended: true,
    features: allLeaguesFeatures(),
    entitlements: allLeaguesEntitlements(),
  },
] as const

export function billingPlanByKey(planKey: string) {
  return BILLING_PLAN_CATALOG.find((plan) => plan.planKey === planKey)
}

export function publicBillingPlans() {
  return BILLING_PLAN_CATALOG.map((plan) => ({
    ...plan,
    features: [...plan.features],
    entitlements: { ...plan.entitlements, leagueIds: [...plan.entitlements.leagueIds] },
  }))
}

function brazilFeatures() {
  return [
    'Brasileirão Série A',
    'Análises probabilísticas dos jogos',
    'Amostra, período e versão do modelo',
    'Atualizações dos próximos confrontos',
  ]
}

function allLeaguesFeatures() {
  return [
    'Brasileirão Série A',
    'Premier League, La Liga, Ligue 1 e Bundesliga',
    'Análises probabilísticas dos jogos',
    'Amostra, período e versão do modelo',
    'Atualizações dos próximos confrontos',
  ]
}

function brazilEntitlements() {
  return {
    leagueIds: ['BRA'],
    leagueScope: 'brasileirao' as const,
    analyses: true as const,
    modelProvenance: true as const,
  }
}

function allLeaguesEntitlements() {
  return {
    leagueIds: ['BRA', 'PL', 'LL', 'L1', 'BUN'],
    leagueScope: 'all' as const,
    analyses: true as const,
    modelProvenance: true as const,
  }
}
