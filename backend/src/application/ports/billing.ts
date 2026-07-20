import type { ActorContext } from './identity.js'

export class BillingGatewayError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export type LocalSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'incomplete'

export interface BillingSubscriptionRecord {
  planKey: string
  planName: string
  priceMinor: number
  currency: string
  interval: 'month' | 'year'
  providerCustomerId: string
  providerSubscriptionId: string
  status: LocalSubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt?: string
}

export interface BillingRepositoryOverview {
  subscription: BillingSubscriptionRecord | null
  usage: Array<{ metric: string; quantity: number; periodStart: string; periodEnd: string }>
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

export interface BillingSubscriptionWrite {
  organizationId: string
  plan: {
    planKey: string
    name: string
    priceMinor: number
    currency: string
    interval: 'month' | 'year'
    entitlements: Record<string, unknown>
  }
  providerCustomerId: string
  providerSubscriptionId: string
  status: LocalSubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt?: string
}

export interface BillingInvoiceWrite {
  organizationId: string
  providerInvoiceId: string
  providerSubscriptionId: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  currency: string
  amountDueMinor: number
  amountPaidMinor: number
  dueAt?: string
  paidAt?: string
  createdAt: string
}

export interface BillingWebhookReceipt {
  process: boolean
  status: 'received' | 'processing' | 'processed' | 'failed'
}

export interface BillingRepository {
  getOverview(actor: ActorContext): Promise<BillingRepositoryOverview>
  getCurrentSubscription(actor: ActorContext): Promise<BillingSubscriptionRecord | null>
  upsertSubscription(input: BillingSubscriptionWrite): Promise<void>
  upsertInvoice(input: BillingInvoiceWrite): Promise<void>
  beginWebhook(input: {
    providerEventId: string
    eventType: string
    payloadSha256: string
    occurredAt?: string
  }): Promise<BillingWebhookReceipt>
  completeWebhook(providerEventId: string): Promise<void>
  failWebhook(providerEventId: string, failureCode: string): Promise<void>
}
