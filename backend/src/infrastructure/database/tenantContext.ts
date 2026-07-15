import { sql } from 'drizzle-orm'
import type { ActorContext } from '../../application/ports/identity.js'
import type { BetIntelDatabase } from './client.js'

export type DatabaseTransaction = Parameters<Parameters<BetIntelDatabase['transaction']>[0]>[0]

export async function applyIdentityContext(
  tx: DatabaseTransaction,
  userId: string,
  emailNormalized?: string | null,
) {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
  await tx.execute(sql`select set_config('app.user_email', ${emailNormalized ?? ''}, true)`)
}

export async function applyOrganizationContext(
  tx: DatabaseTransaction,
  organizationId: string,
) {
  await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`)
}

export async function applyActorContext(tx: DatabaseTransaction, actor: ActorContext) {
  await applyIdentityContext(tx, actor.userId)
  await applyOrganizationContext(tx, actor.organizationId)
}
