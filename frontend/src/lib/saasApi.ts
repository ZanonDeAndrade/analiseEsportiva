import {
  authenticatedFetchJson,
  cachedAuthenticatedFetchJson,
  invalidateApiCache,
  type AccessTokenProvider,
} from './api'

export type MembershipRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface MeResponse {
  userId: string
  organizationId: string
  role: MembershipRole
  sessionId: string
  platformAdmin?: boolean
}

export type SupportCategory = 'access' | 'billing' | 'data' | 'privacy' | 'security' | 'technical' | 'other'
export type SupportSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4'
export interface SupportTicket {
  id: string
  category: SupportCategory
  severity: SupportSeverity
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved'
  ownerTeam: string
  subject: string
  description: string
  slaDueAt: string
  createdAt: string
  updatedAt: string
}

export interface IncidentRecord {
  id: string
  severity: SupportSeverity
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  ownerTeam: string
  title: string
  summary: string
  publicReference?: string
  startedAt: string
  updatedAt: string
}

export interface OrganizationSummary {
  id: string
  slug: string
  name: string
  role: MembershipRole
  active: boolean
}

export interface BillingSubscription {
  planName: string
  status: string
  priceMinor: number
  currency: string
  interval: 'month' | 'year'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  refundPolicy: string
}

export interface BillingOverview {
  plans: Array<{
    planKey: string
    productKey: 'brasileirao' | 'todas-ligas'
    name: string
    description: string
    priceMinor: number
    monthlyEquivalentMinor: number
    savingsMinor: number
    currency: string
    interval: 'month' | 'year'
    recommended: boolean
    features: string[]
    entitlements: Record<string, unknown>
  }>
  subscription: BillingSubscription | null
  usage: Array<{ metric: string; quantity: number; limit?: number; periodStart: string; periodEnd: string }>
  invoices: Array<{
    id: string
    status: string
    currency: string
    amountDueMinor: number
    amountPaidMinor: number
    dueAt?: string
    paidAt?: string
    createdAt: string
  }>
}

export async function loadWorkspaceBootstrap(getToken: AccessTokenProvider, signal?: AbortSignal) {
  const [me, organizations] = await Promise.all([
    cachedAuthenticatedFetchJson<MeResponse>('workspace:me', '/v1/me', getToken, { ttlMs: 60_000, signal }),
    cachedAuthenticatedFetchJson<{ organizations: OrganizationSummary[] }>(
      'workspace:organizations', '/v1/organizations', getToken, { ttlMs: 60_000, signal },
    ),
  ])
  return { me, organizations: organizations.organizations }
}

export async function switchOrganization(getToken: AccessTokenProvider, organizationId: string) {
  const result = await authenticatedFetchJson<OrganizationSummary>('/v1/organizations/switch', getToken, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId }),
  })
  invalidateApiCache()
  return result
}

export function loadBilling(getToken: AccessTokenProvider, signal?: AbortSignal) {
  return cachedAuthenticatedFetchJson<{ configured: boolean; overview: BillingOverview | null }>(
    'workspace:billing:v2', '/v1/billing/overview', getToken, { ttlMs: 60_000, signal },
  )
}

export async function openBillingPortal(getToken: AccessTokenProvider) {
  return authenticatedFetchJson<{ url: string; expiresAt: string }>('/v1/billing/portal', getToken, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() },
  })
}

export async function createCheckout(getToken: AccessTokenProvider, planKey: string) {
  return authenticatedFetchJson<{ url: string; expiresAt: string }>('/v1/billing/checkout', getToken, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ planKey }),
  })
}

export async function loadSupportTickets(getToken: AccessTokenProvider, signal?: AbortSignal) {
  return cachedAuthenticatedFetchJson<{ tickets: SupportTicket[] }>(
    'workspace:support-tickets', '/v1/support/tickets', getToken, { ttlMs: 30_000, signal },
  )
}

export async function createSupportTicket(
  getToken: AccessTokenProvider,
  input: { category: SupportCategory; severity: SupportSeverity; subject: string; description: string },
) {
  const ticket = await authenticatedFetchJson<SupportTicket>('/v1/support/tickets', getToken, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
  invalidateApiCache('workspace:support-tickets')
  return ticket
}

export async function exportSubjectData(getToken: AccessTokenProvider) {
  const payload = await authenticatedFetchJson<Record<string, unknown>>('/v1/privacy/export', getToken)
  downloadJsonFile(`betintel-dados-${new Date().toISOString().slice(0, 10)}.json`, payload)
}

export async function requestDataCorrection(getToken: AccessTokenProvider, subject: string, details: string) {
  return authenticatedFetchJson<SupportTicket>('/v1/privacy/corrections', getToken, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, details }),
  })
}

export async function deleteOrganizationData(getToken: AccessTokenProvider) {
  await authenticatedFetchJson<void>('/v1/privacy/organization', getToken, { method: 'DELETE' })
  invalidateApiCache()
}

export async function loadAdminOperations(getToken: AccessTokenProvider, signal?: AbortSignal) {
  const [tickets, incidents, audit, queues] = await Promise.all([
    authenticatedFetchJson<{ tickets: SupportTicket[] }>('/v1/admin/support/tickets', getToken, { signal }),
    authenticatedFetchJson<{ incidents: IncidentRecord[] }>('/v1/admin/incidents', getToken, { signal }),
    authenticatedFetchJson<{ entries: Array<Record<string, unknown>> }>('/v1/admin/audit?limit=50', getToken, { signal }),
    authenticatedFetchJson<{ queues: Array<Record<string, unknown>> }>('/v1/admin/queues', getToken, { signal }),
  ])
  return { tickets: tickets.tickets, incidents: incidents.incidents, audit: audit.entries, queues: queues.queues }
}

export async function updateAdminTicket(getToken: AccessTokenProvider, id: string, status: SupportTicket['status'], ownerTeam: string) {
  return authenticatedFetchJson<SupportTicket>(`/v1/admin/support/tickets/${encodeURIComponent(id)}`, getToken, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, ownerTeam }),
  })
}

export async function createIncident(
  getToken: AccessTokenProvider,
  input: { severity: SupportSeverity; title: string; summary: string; ownerTeam: string; publicReference?: string },
) {
  return authenticatedFetchJson<IncidentRecord>('/v1/admin/incidents', getToken, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
}

function downloadJsonFile(fileName: string, payload: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
