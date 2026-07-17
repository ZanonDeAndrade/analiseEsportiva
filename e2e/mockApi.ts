import type { Page, Route } from '@playwright/test'

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const orgA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const orgB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

export async function mockApi(page: Page, options: { expiredSession?: boolean; platformAdmin?: boolean } = {}) {
  const state = {
    activeOrganizationId: orgA,
    supportTickets: [] as Array<Record<string, unknown>>,
  }
  await page.route('http://127.0.0.1:3333/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/v1/me') {
      if (options.expiredSession) return json(route, { detail: 'Sessao revogada', code: 'session_revoked' }, 401)
      return json(route, { userId, organizationId: state.activeOrganizationId, role: 'owner', sessionId: 'e2e-session', platformAdmin: options.platformAdmin ?? false })
    }
    if (path === '/v1/organizations' && method === 'GET') return json(route, { organizations: organizations(state.activeOrganizationId) })
    if (path === '/v1/organizations/switch' && method === 'POST') {
      state.activeOrganizationId = request.postDataJSON().organizationId
      return json(route, organizations(state.activeOrganizationId).find((item) => item.id === state.activeOrganizationId))
    }
    if (path === '/v1/fixtures') return json(route, { fixtures: [fixture(state.activeOrganizationId)] })
    if (path === '/v1/predictions') return json(route, prediction())
    if (path === '/v1/billing/overview') return json(route, { configured: false, overview: null })
    if (path === '/v1/account/sessions') return json(route, { sessions: [{ id: 'e2e-session', current: true, userAgent: 'Navegador de validação responsiva com descrição longa', lastSeenAt: '2099-01-01T10:00:00Z' }] })
    if (path === '/v1/legal/acceptances') return json(route, { acceptances: [{ id: 'acceptance-e2e', documentType: 'terms', documentVersion: '1.0', acceptedAt: '2099-01-01T10:00:00Z', contentHash: 'a'.repeat(64), documentUrl: '/termos-de-uso' }] })
    if (path === '/v1/billing/subscription') return json(route, { configured: false, subscription: null })
    if (path === '/v1/support/tickets' && method === 'GET') return json(route, { tickets: state.supportTickets })
    if (path === '/v1/support/tickets' && method === 'POST') {
      const body = request.postDataJSON()
      const ticket = { id: crypto.randomUUID(), ...body, status: 'open', ownerTeam: body.category === 'privacy' ? 'privacy' : 'support', slaDueAt: '2099-01-02T00:00:00Z', createdAt: '2099-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z' }
      state.supportTickets.push(ticket)
      return json(route, ticket, 201)
    }
    if (path === '/v1/admin/support/tickets') return json(route, { tickets: [] })
    if (path === '/v1/admin/incidents') return json(route, { incidents: [] })
    if (path === '/v1/admin/audit') return json(route, { entries: [] })
    if (path === '/v1/admin/queues') return json(route, { queues: [] })
    if (path === '/v1/admin/data-quality') return json(route, { issues: [] })
    if (path === '/v1/admin/team-aliases') return json(route, { aliases: [] })
    if (path === '/v1/admin/data-freshness') return json(route, { current: 4, stale: 0, missingTimestamp: 0 })
    return json(route, { detail: `Mock ausente para ${method} ${path}` }, 404)
  })
  return state
}

function organizations(active: string) {
  return [
    { id: orgA, slug: 'laboratorio-a', name: 'Laboratorio A', role: 'owner', active: active === orgA },
    { id: orgB, slug: 'laboratorio-b', name: 'Laboratorio B', role: 'owner', active: active === orgB },
  ]
}

function fixture(organizationId: string) {
  const suffix = organizationId === orgA ? 'A' : 'B'
  return {
    id: `fixture-${suffix}`, fixtureId: organizationId === orgA ? 101 : 202,
    competition: `Competicao ${suffix}`, leagueId: 'BRA', league: `Liga ${suffix}`, season: '2099', round: '1',
    date: '01/01/2099', time: '18:00', isoDate: '2099-01-01T21:00:00Z', status: 'not_started',
    homeTeam: `Equipe ${suffix} Norte`, awayTeam: `Equipe ${suffix} Sul`, sourceProvider: 'provider-test', updatedAt: '2098-12-30T10:00:00Z',
  }
}

function prediction() {
  return {
    sourceProvider: 'provider-test', updatedAt: '2098-12-30T10:00:00Z', sampleSize: 120, confidence: 'Alta',
    ethicalNotice: 'Estimativa educacional; nao e certeza nem recomendacao.', modelVersion: 'model-e2e-001', datasetVersion: 'dataset-e2e-001', codeVersion: 'commit-e2e', featureSetVersion: 'features-e2e',
    period: { from: '2022-01-01', to: '2098-12-01' }, limitations: ['Escalacoes futuras nao fazem parte das features.'],
    ignoredMarkets: [],
    availableMarkets: [{
      market: '1X2', displayName: 'Resultado 1X2', sampleSize: 120, confidence: 'Alta', sourceSegment: 'league:Liga',
      period: { from: '2022-01-01', to: '2098-12-01' }, modelVersion: 'model-e2e-001', limitations: ['Amostra historica.'], status: 'available',
      selections: [
        { key: 'home_win', label: 'Casa', probability: 48, uncertainty: { lower: 39, upper: 57, level: .95, method: 'wilson' } },
        { key: 'draw', label: 'Empate', probability: 27, uncertainty: { lower: 20, upper: 35, level: .95, method: 'wilson' } },
        { key: 'away_win', label: 'Fora', probability: 25, uncertainty: { lower: 18, upper: 33, level: .95, method: 'wilson' } },
      ],
    }],
  }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}
