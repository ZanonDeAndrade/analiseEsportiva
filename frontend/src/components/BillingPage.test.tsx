import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import BillingPage from './BillingPage'

const { loadBillingMock, createCheckoutMock, openBillingPortalMock } = vi.hoisted(() => ({
  loadBillingMock: vi.fn(),
  createCheckoutMock: vi.fn(),
  openBillingPortalMock: vi.fn(),
}))

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({ getAccessTokenSilently: vi.fn() }),
}))

vi.mock('../lib/saasApi', () => ({
  loadBilling: loadBillingMock,
  createCheckout: createCheckoutMock,
  openBillingPortal: openBillingPortalMock,
}))

beforeEach(() => {
  loadBillingMock.mockResolvedValue({
    configured: false,
    overview: {
      plans: [
        plan('brasileirao', 'brasileirao', 'Plano Brasileirão', 1990, 1990, 0, 'month', ['BRA']),
        plan('todas-ligas', 'todas-ligas', 'Plano Todas as Ligas', 3990, 3990, 0, 'month', ['BRA', 'PL', 'LL', 'L1', 'BUN']),
        plan('brasileirao-anual', 'brasileirao', 'Plano Brasileirão', 17880, 1490, 6000, 'year', ['BRA']),
        plan('todas-ligas-anual', 'todas-ligas', 'Plano Todas as Ligas', 41880, 3490, 6000, 'year', ['BRA', 'PL', 'LL', 'L1', 'BUN']),
      ],
      subscription: null,
      usage: [],
      invoices: [],
    },
  })
})

it('alterna entre preços mensais e anuais definidos pelo servidor sem checkout fictício', async () => {
  render(<BillingPage />)

  expect(await screen.findByRole('heading', { name: 'Plano Brasileirão' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Plano Todas as Ligas' })).toBeVisible()
  expect(screen.getAllByText(/R\$\s?19[,.]90/)).toHaveLength(2)
  expect(screen.getAllByText(/R\$\s?39[,.]90/)).toHaveLength(2)
  expect(screen.queryByText(/R\$\s?14[,.]90/)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Anual' }))

  expect(screen.getByText(/R\$\s?14[,.]90/)).toBeVisible()
  expect(screen.getByText(/R\$\s?34[,.]90/)).toBeVisible()
  expect(screen.getByText(/R\$\s?178[,.]80/)).toBeVisible()
  expect(screen.getByText(/R\$\s?418[,.]80/)).toBeVisible()
  expect(screen.getAllByText(/Economize R\$\s?60[,.]00 por ano/)).toHaveLength(2)
  expect(screen.getByText('1 liga incluída')).toBeVisible()
  expect(screen.getByText('5 ligas incluídas')).toBeVisible()
  for (const button of screen.getAllByRole('button', { name: 'Checkout em breve' })) {
    expect(button).toBeDisabled()
  }
  expect(createCheckoutMock).not.toHaveBeenCalled()
})

it('nunca exibe NaN nem uma área vazia quando recebe temporariamente o catálogo antigo', async () => {
  loadBillingMock.mockResolvedValueOnce({
    configured: false,
    overview: {
      plans: [
        { planKey: 'brasileirao', name: 'Plano Brasileirão', description: 'Brasileirão.', priceMinor: 1990, currency: 'BRL', interval: 'month', recommended: false, features: [], entitlements: { leagueIds: ['BRA'] } },
        { planKey: 'todas-ligas', name: 'Plano Todas as Ligas', description: 'Todas.', priceMinor: 2990, currency: 'BRL', interval: 'month', recommended: true, features: [], entitlements: { leagueIds: ['BRA', 'PL', 'LL', 'L1', 'BUN'] } },
      ],
      subscription: null,
      usage: [],
      invoices: [],
    },
  })

  render(<BillingPage />)

  expect(await screen.findByRole('heading', { name: 'Plano Brasileirão' })).toBeVisible()
  expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  expect(screen.getAllByText(/R\$\s?19[,.]90/)).toHaveLength(2)

  fireEvent.click(screen.getByRole('button', { name: 'Anual' }))

  expect(screen.getByText('Planos ainda não publicados')).toBeVisible()
  expect(screen.getByText(/não retornou opções de cobrança anual/i)).toBeVisible()
})

function plan(
  planKey: string,
  productKey: 'brasileirao' | 'todas-ligas',
  name: string,
  priceMinor: number,
  monthlyEquivalentMinor: number,
  savingsMinor: number,
  interval: 'month' | 'year',
  leagueIds: string[],
) {
  return {
    planKey, productKey, name,
    description: productKey === 'brasileirao' ? 'Somente Brasileirão Série A.' : 'Todas as ligas.',
    priceMinor, monthlyEquivalentMinor, savingsMinor,
    currency: 'BRL', interval, recommended: productKey === 'todas-ligas',
    features: productKey === 'brasileirao' ? ['Brasileirão Série A'] : ['Cinco ligas'],
    entitlements: { leagueIds },
  }
}
