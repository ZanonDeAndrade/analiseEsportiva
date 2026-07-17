import type { ActorContext } from './identity.js'

export type SupportCategory = 'access' | 'billing' | 'data' | 'privacy' | 'security' | 'technical' | 'other'
export type SupportSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4'
export type SupportStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved'
export type OperationsOwner = 'support' | 'engineering' | 'security' | 'billing' | 'privacy'

export interface SupportTicket {
  id: string
  category: SupportCategory
  severity: SupportSeverity
  status: SupportStatus
  ownerTeam: OperationsOwner
  subject: string
  description: string
  slaDueAt: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

export interface IncidentRecord {
  id: string
  severity: SupportSeverity
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  ownerTeam: OperationsOwner
  title: string
  summary: string
  publicReference?: string
  startedAt: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: number
  action: string
  targetType: string
  targetId?: string
  requestId?: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface OperationsRepository {
  createSupportTicket(actor: ActorContext, input: { category: SupportCategory; severity: SupportSeverity; subject: string; description: string }): Promise<SupportTicket>
  listOwnSupportTickets(actor: ActorContext): Promise<SupportTicket[]>
  listSupportTickets(actor: ActorContext): Promise<SupportTicket[]>
  updateSupportTicket(actor: ActorContext, id: string, input: { status: SupportStatus; ownerTeam: OperationsOwner }): Promise<SupportTicket | null>
  listAudit(actor: ActorContext, limit: number): Promise<AuditEntry[]>
  listIncidents(actor: ActorContext): Promise<IncidentRecord[]>
  createIncident(actor: ActorContext, input: { severity: SupportSeverity; title: string; summary: string; ownerTeam: OperationsOwner; publicReference?: string }): Promise<IncidentRecord>
  updateIncident(actor: ActorContext, id: string, input: { status: IncidentRecord['status']; summary: string; ownerTeam: OperationsOwner; publicReference?: string }): Promise<IncidentRecord | null>
}
