import type { ActorContext } from './identity.js'

export interface SavedQueryFilters {
  league: string
  period: string
  market: string
  query: string
}

export interface SavedQuery {
  id: string
  name: string
  filters: SavedQueryFilters
  createdAt: string
  updatedAt: string
}

export interface AlertRule {
  id: string
  name: string
  savedQueryId?: string
  channel: 'email' | 'in_app'
  status: 'paused' | 'active'
  deliveryState: 'configured' | 'not_configured' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface WorkspaceRepository {
  listSavedQueries(actor: ActorContext): Promise<SavedQuery[]>
  createSavedQuery(actor: ActorContext, name: string, filters: SavedQueryFilters): Promise<SavedQuery>
  deleteSavedQuery(actor: ActorContext, id: string): Promise<boolean>
  listAlertRules(actor: ActorContext): Promise<AlertRule[]>
  createAlertRule(
    actor: ActorContext,
    input: { name: string; savedQueryId?: string; channel: AlertRule['channel'] },
  ): Promise<AlertRule>
  deleteAlertRule(actor: ActorContext, id: string): Promise<boolean>
}
