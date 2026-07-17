import { sql } from 'drizzle-orm'
import { membershipRoleValues } from '../../application/authorization.js'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'string' })

export const iam = pgSchema('iam')
export const billing = pgSchema('billing')
export const legal = pgSchema('legal')
export const sports = pgSchema('sports')
export const model = pgSchema('model')
export const ops = pgSchema('ops')

export const organizationStatus = iam.enum('organization_status', [
  'active',
  'suspended',
  'closed',
])
export const userStatus = iam.enum('user_status', ['active', 'disabled'])
export const membershipRole = iam.enum('membership_role', membershipRoleValues)
export const membershipStatus = iam.enum('membership_status', [
  'active',
  'suspended',
  'revoked',
])
export const invitationStatus = iam.enum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
])
export const apiKeyStatus = iam.enum('api_key_status', ['active', 'revoked', 'expired'])

export const organizations = iam.table(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: organizationStatus('status').notNull().default('active'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organizations_slug_uidx').on(table.slug),
    check('organizations_slug_format_ck', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}$'`),
    check('organizations_name_not_blank_ck', sql`length(btrim(${table.name})) > 0`),
  ],
)

export const users = iam.table(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identityProvider: text('identity_provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    emailVerified: boolean('email_verified').notNull().default(false),
    displayName: text('display_name'),
    status: userStatus('status').notNull().default('active'),
    providerUpdatedAt: utcTimestamp('provider_updated_at'),
    lastIdentitySyncAt: utcTimestamp('last_identity_sync_at').notNull().defaultNow(),
    disabledAt: utcTimestamp('disabled_at'),
    deletedAt: utcTimestamp('deleted_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('users_provider_subject_uq').on(table.identityProvider, table.providerSubject),
    uniqueIndex('users_email_normalized_uidx')
      .on(table.emailNormalized)
      .where(sql`${table.emailNormalized} is not null`),
    check(
      'users_email_pair_ck',
      sql`(${table.email} is null and ${table.emailNormalized} is null) or (${table.email} is not null and ${table.emailNormalized} is not null)`,
    ),
    check(
      'users_status_timestamps_ck',
      sql`(${table.status} = 'active' and ${table.disabledAt} is null and ${table.deletedAt} is null) or (${table.status} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
  ],
)

export const memberships = iam.table(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('active'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('memberships_organization_user_uq').on(table.organizationId, table.userId),
    index('memberships_user_status_idx').on(table.userId, table.status),
    index('memberships_organization_status_idx').on(table.organizationId, table.status),
  ],
)

export const invitations = iam.table(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    emailNormalized: text('email_normalized').notNull(),
    role: membershipRole('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    expiresAt: utcTimestamp('expires_at').notNull(),
    acceptedAt: utcTimestamp('accepted_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('invitations_token_hash_uq').on(table.tokenHash),
    index('invitations_organization_status_idx').on(table.organizationId, table.status),
    check(
      'invitations_acceptance_ck',
      sql`${table.status} <> 'accepted' or (${table.acceptedByUserId} is not null and ${table.acceptedAt} is not null)`,
    ),
  ],
)

export const apiKeys = iam.table(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    status: apiKeyStatus('status').notNull().default('active'),
    lastUsedAt: utcTimestamp('last_used_at'),
    expiresAt: utcTimestamp('expires_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    revokedAt: utcTimestamp('revoked_at'),
  },
  (table) => [
    unique('api_keys_key_prefix_uq').on(table.keyPrefix),
    index('api_keys_organization_status_idx').on(table.organizationId, table.status),
    check('api_keys_name_not_blank_ck', sql`length(btrim(${table.name})) > 0`),
  ],
)

export const sessionMetadata = iam.table(
  'session_metadata',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    identityProvider: text('identity_provider').notNull(),
    providerSessionId: text('provider_session_id').notNull(),
    lastSeenAt: utcTimestamp('last_seen_at').notNull().defaultNow(),
    expiresAt: utcTimestamp('expires_at').notNull(),
    authenticatedAt: utcTimestamp('authenticated_at'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    revokedAt: utcTimestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('session_metadata_provider_session_uq').on(
      table.identityProvider,
      table.providerSessionId,
    ),
    index('session_metadata_user_expires_idx').on(table.userId, table.expiresAt),
    index('session_metadata_user_revoked_idx').on(table.userId, table.revokedAt),
    check(
      'session_metadata_revocation_ck',
      sql`(${table.revokedAt} is null and ${table.revokedReason} is null) or (${table.revokedAt} is not null and ${table.revokedReason} is not null)`,
    ),
  ],
)

export const legalDocumentType = legal.enum('document_type', [
  'terms',
  'privacy',
  'risk',
  'refund',
  'acceptable_use',
  'responsible_gaming',
])
export const legalChangeKind = legal.enum('change_kind', ['material', 'non_material'])
export const legalAcceptancePurpose = legal.enum('acceptance_purpose', [
  'signup',
  'first_access',
  'material_update',
  'subscription',
  'age_confirmation',
  'marketing',
])

export const legalDocuments = legal.table(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: legalDocumentType('type').notNull(),
    version: text('version').notNull(),
    title: text('title').notNull(),
    contentHash: text('content_hash').notNull(),
    publishedAt: utcTimestamp('published_at'),
    effectiveAt: utcTimestamp('effective_at'),
    documentUrl: text('document_url').notNull(),
    acceptanceGroup: text('acceptance_group').notNull(),
    changeKind: legalChangeKind('change_kind').notNull().default('material'),
    changeSummary: text('change_summary').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('legal_documents_type_version_uq').on(table.type, table.version),
    unique('legal_documents_type_hash_uq').on(table.type, table.contentHash),
    uniqueIndex('legal_documents_one_active_type_uidx')
      .on(table.type)
      .where(sql`${table.isActive} = true`),
    index('legal_documents_type_created_idx').on(table.type, table.createdAt),
    check('legal_documents_hash_ck', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check('legal_documents_version_not_blank_ck', sql`length(btrim(${table.version})) > 0`),
    check('legal_documents_acceptance_group_not_blank_ck', sql`length(btrim(${table.acceptanceGroup})) > 0`),
  ],
)

export const legalAcceptances = legal.table(
  'acceptances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    evidenceEventId: uuid('evidence_event_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    legalDocumentId: uuid('legal_document_id')
      .notNull()
      .references(() => legalDocuments.id, { onDelete: 'restrict' }),
    documentType: legalDocumentType('document_type').notNull(),
    documentVersion: text('document_version').notNull(),
    acceptanceGroup: text('acceptance_group').notNull(),
    acceptancePurpose: legalAcceptancePurpose('acceptance_purpose').notNull(),
    acceptedAt: utcTimestamp('accepted_at').notNull().defaultNow(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    contentHash: text('content_hash').notNull(),
    documentUrl: text('document_url').notNull(),
    evidenceMetadata: jsonb('evidence_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    revokedAt: utcTimestamp('revoked_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('legal_acceptances_idempotency_document_uq').on(
      table.userId,
      table.organizationId,
      table.idempotencyKey,
      table.legalDocumentId,
    ),
    index('legal_acceptances_user_created_idx').on(table.userId, table.createdAt),
    index('legal_acceptances_organization_created_idx').on(table.organizationId, table.createdAt),
    index('legal_acceptances_requirement_idx').on(
      table.userId,
      table.organizationId,
      table.documentType,
      table.acceptanceGroup,
    ),
    check('legal_acceptances_hash_ck', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'legal_acceptances_marketing_revocation_ck',
      sql`${table.revokedAt} is null or ${table.acceptancePurpose} = 'marketing'`,
    ),
  ],
)

export const billingInterval = billing.enum('billing_interval', ['month', 'year'])
export const subscriptionStatus = billing.enum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'incomplete',
])
export const invoiceStatus = billing.enum('invoice_status', [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
])
export const webhookStatus = billing.enum('webhook_status', [
  'received',
  'processing',
  'processed',
  'failed',
])

export const plans = billing.table(
  'plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planKey: text('plan_key').notNull(),
    name: text('name').notNull(),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull(),
    interval: billingInterval('interval').notNull(),
    entitlements: jsonb('entitlements').$type<Record<string, unknown>>().notNull(),
    active: boolean('active').notNull().default(false),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('plans_plan_key_uq').on(table.planKey),
    check('plans_price_non_negative_ck', sql`${table.priceMinor} >= 0`),
    check('plans_currency_ck', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
)

export const subscriptions = billing.table(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    status: subscriptionStatus('status').notNull(),
    currentPeriodStart: utcTimestamp('current_period_start').notNull(),
    currentPeriodEnd: utcTimestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: utcTimestamp('canceled_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('subscriptions_provider_subscription_uq').on(
      table.provider,
      table.providerSubscriptionId,
    ),
    index('subscriptions_organization_status_idx').on(table.organizationId, table.status),
    check(
      'subscriptions_period_ck',
      sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`,
    ),
  ],
)

export const usageRecords = billing.table(
  'usage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'restrict',
    }),
    metric: text('metric').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    periodStart: utcTimestamp('period_start').notNull(),
    periodEnd: utcTimestamp('period_end').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    recordedAt: utcTimestamp('recorded_at').notNull().defaultNow(),
  },
  (table) => [
    unique('usage_records_organization_idempotency_uq').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('usage_records_organization_metric_period_idx').on(
      table.organizationId,
      table.metric,
      table.periodStart,
    ),
    check('usage_records_quantity_non_negative_ck', sql`${table.quantity} >= 0`),
    check('usage_records_period_ck', sql`${table.periodEnd} > ${table.periodStart}`),
  ],
)

export const invoices = billing.table(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'restrict',
    }),
    provider: text('provider').notNull(),
    providerInvoiceId: text('provider_invoice_id').notNull(),
    status: invoiceStatus('status').notNull(),
    currency: text('currency').notNull(),
    amountDueMinor: integer('amount_due_minor').notNull(),
    amountPaidMinor: integer('amount_paid_minor').notNull().default(0),
    dueAt: utcTimestamp('due_at'),
    paidAt: utcTimestamp('paid_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('invoices_provider_invoice_uq').on(table.provider, table.providerInvoiceId),
    index('invoices_organization_status_idx').on(table.organizationId, table.status),
    check(
      'invoices_amounts_non_negative_ck',
      sql`${table.amountDueMinor} >= 0 and ${table.amountPaidMinor} >= 0`,
    ),
    check('invoices_currency_ck', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
)

export const webhookEvents = billing.table(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    status: webhookStatus('status').notNull().default('received'),
    payloadSha256: text('payload_sha256').notNull(),
    occurredAt: utcTimestamp('occurred_at'),
    receivedAt: utcTimestamp('received_at').notNull().defaultNow(),
    processedAt: utcTimestamp('processed_at'),
    failureCode: text('failure_code'),
  },
  (table) => [
    unique('webhook_events_provider_event_uq').on(table.provider, table.providerEventId),
    index('webhook_events_status_received_idx').on(table.status, table.receivedAt),
    check('webhook_events_hash_ck', sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`),
  ],
)

export const fixtureStatus = sports.enum('fixture_status', [
  'scheduled',
  'not_started',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled',
  'abandoned',
  'extra_time',
  'penalties',
  'unknown',
])
export const aliasReviewStatus = sports.enum('alias_review_status', [
  'auto_accepted',
  'pending',
  'approved',
  'rejected',
])
export const dataQualityStatus = sports.enum('data_quality_status', [
  'open',
  'resolved',
  'rejected',
])

export const competitions = sports.table(
  'competitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    name: text('name').notNull(),
    countryCode: text('country_code'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('competitions_source_external_uq').on(table.sourceProvider, table.externalId),
    unique('competitions_canonical_key_uq').on(table.canonicalKey),
    index('competitions_name_idx').on(table.name),
  ],
)

export const competitionExternalIds = sports.table(
  'competition_external_ids',
  {
    competitionId: uuid('competition_id').notNull().references(() => competitions.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceProvider, table.externalId] }),
    index('competition_external_ids_competition_idx').on(table.competitionId),
  ],
)

export const seasons = sports.table(
  'seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'restrict' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    label: text('label').notNull(),
    startsOn: timestamp('starts_on', { mode: 'string' }),
    endsOn: timestamp('ends_on', { mode: 'string' }),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('seasons_source_external_uq').on(table.sourceProvider, table.externalId),
    unique('seasons_canonical_key_uq').on(table.canonicalKey),
    index('seasons_competition_label_idx').on(table.competitionId, table.label),
    check(
      'seasons_date_range_ck',
      sql`${table.startsOn} is null or ${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
)

export const seasonExternalIds = sports.table(
  'season_external_ids',
  {
    seasonId: uuid('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceProvider, table.externalId] }),
    index('season_external_ids_season_idx').on(table.seasonId),
  ],
)

export const teams = sports.table(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    canonicalName: text('canonical_name').notNull(),
    countryCode: text('country_code'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('teams_source_external_uq').on(table.sourceProvider, table.externalId),
    unique('teams_canonical_key_uq').on(table.canonicalKey),
    index('teams_canonical_name_idx').on(table.canonicalName),
  ],
)

export const teamAliases = sports.table(
  'team_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    externalId: text('external_id').notNull(),
    reviewStatus: aliasReviewStatus('review_status').notNull().default('auto_accepted'),
    reviewedAt: utcTimestamp('reviewed_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('team_aliases_source_normalized_uq').on(
      table.sourceProvider,
      table.normalizedAlias,
    ),
    unique('team_aliases_source_external_uq').on(table.sourceProvider, table.externalId),
    index('team_aliases_team_idx').on(table.teamId),
  ],
)

export const fixtures = sports.table(
  'fixtures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'restrict' }),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'restrict' }),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    startsAt: utcTimestamp('starts_at').notNull(),
    status: fixtureStatus('status').notNull().default('unknown'),
    rawStatus: text('raw_status'),
    round: text('round'),
    sourceUpdatedAt: utcTimestamp('source_updated_at'),
    lastSeenAt: utcTimestamp('last_seen_at').notNull().defaultNow(),
    freshUntil: utcTimestamp('fresh_until').notNull(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('fixtures_source_external_uq').on(table.sourceProvider, table.externalId),
    index('fixtures_competition_starts_idx').on(table.competitionId, table.startsAt),
    index('fixtures_season_starts_idx').on(table.seasonId, table.startsAt),
    index('fixtures_home_starts_idx').on(table.homeTeamId, table.startsAt),
    index('fixtures_away_starts_idx').on(table.awayTeamId, table.startsAt),
    index('fixtures_status_starts_idx').on(table.status, table.startsAt),
    index('fixtures_fresh_until_idx').on(table.freshUntil),
    check('fixtures_different_teams_ck', sql`${table.homeTeamId} <> ${table.awayTeamId}`),
  ],
)

export const matchResults = sports.table(
  'match_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fixtureId: uuid('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    outcome: text('outcome').notNull(),
    decision: text('decision').notNull().default('regulation'),
    winner: text('winner').notNull().default('draw'),
    homeExtraTimeGoals: integer('home_extra_time_goals'),
    awayExtraTimeGoals: integer('away_extra_time_goals'),
    homePenaltyGoals: integer('home_penalty_goals'),
    awayPenaltyGoals: integer('away_penalty_goals'),
    revision: integer('revision').notNull().default(1),
    recordedAt: utcTimestamp('recorded_at').notNull().defaultNow(),
    sourceUpdatedAt: utcTimestamp('source_updated_at'),
  },
  (table) => [
    unique('match_results_fixture_uq').on(table.fixtureId),
    unique('match_results_source_external_uq').on(table.sourceProvider, table.externalId),
    check(
      'match_results_goals_non_negative_ck',
      sql`${table.homeGoals} >= 0 and ${table.awayGoals} >= 0`,
    ),
    check('match_results_outcome_ck', sql`${table.outcome} in ('H', 'D', 'A')`),
    check('match_results_decision_ck', sql`${table.decision} in ('regulation', 'extra_time', 'penalties', 'administrative')`),
    check('match_results_winner_ck', sql`${table.winner} in ('home', 'away', 'draw', 'undetermined')`),
  ],
)

export const matchResultRevisions = sports.table(
  'match_result_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fixtureId: uuid('fixture_id').notNull().references(() => fixtures.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    sourceProvider: text('source_provider').notNull(),
    recordSha256: text('record_sha256').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    outcome: text('outcome').notNull(),
    decision: text('decision').notNull(),
    winner: text('winner').notNull(),
    homeExtraTimeGoals: integer('home_extra_time_goals'),
    awayExtraTimeGoals: integer('away_extra_time_goals'),
    homePenaltyGoals: integer('home_penalty_goals'),
    awayPenaltyGoals: integer('away_penalty_goals'),
    sourceUpdatedAt: utcTimestamp('source_updated_at'),
    recordedAt: utcTimestamp('recorded_at').notNull().defaultNow(),
  },
  (table) => [
    unique('match_result_revisions_fixture_revision_uq').on(table.fixtureId, table.revision),
    unique('match_result_revisions_fixture_hash_uq').on(table.fixtureId, table.recordSha256),
    index('match_result_revisions_fixture_idx').on(table.fixtureId, table.recordedAt),
  ],
)

export const matchStats = sports.table(
  'match_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fixtureId: uuid('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    homeCorners: integer('home_corners'),
    awayCorners: integer('away_corners'),
    homeYellowCards: integer('home_yellow_cards'),
    awayYellowCards: integer('away_yellow_cards'),
    homeRedCards: integer('home_red_cards'),
    awayRedCards: integer('away_red_cards'),
    extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    recordedAt: utcTimestamp('recorded_at').notNull().defaultNow(),
  },
  (table) => [
    unique('match_stats_fixture_uq').on(table.fixtureId),
    unique('match_stats_source_external_uq').on(table.sourceProvider, table.externalId),
    check(
      'match_stats_non_negative_ck',
      sql`coalesce(${table.homeCorners}, 0) >= 0 and coalesce(${table.awayCorners}, 0) >= 0 and coalesce(${table.homeYellowCards}, 0) >= 0 and coalesce(${table.awayYellowCards}, 0) >= 0 and coalesce(${table.homeRedCards}, 0) >= 0 and coalesce(${table.awayRedCards}, 0) >= 0`,
    ),
  ],
)

export const datasetStatus = model.enum('dataset_status', ['building', 'ready', 'failed'])
export const modelStatus = model.enum('model_status', ['training', 'challenger', 'ready', 'rejected', 'failed', 'retired'])
export const segmentStatus = model.enum('segment_status', ['available', 'insufficient_data'])
export const predictionStatus = model.enum('prediction_status', [
  'pending',
  'completed',
  'dados_insuficientes',
  'failed',
])
export const evaluationKind = model.enum('evaluation_kind', ['evaluation', 'backtest'])
export const resourceScope = model.enum('resource_scope', ['system', 'organization'])

export const datasetVersions = model.table(
  'dataset_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    datasetKey: text('dataset_key').notNull(),
    version: integer('version').notNull(),
    contentSha256: text('content_sha256').notNull(),
    status: datasetStatus('status').notNull(),
    acceptedRows: integer('accepted_rows').notNull().default(0),
    rejectedRows: integer('rejected_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    ambiguousRows: integer('ambiguous_rows').notNull().default(0),
    sourceProviders: text('source_providers').array().notNull().default(sql`'{}'::text[]`),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('dataset_versions_key_version_uq').on(table.datasetKey, table.version),
    unique('dataset_versions_content_hash_uq').on(table.contentSha256),
    check('dataset_versions_hash_ck', sql`${table.contentSha256} ~ '^[a-f0-9]{64}$'`),
    check(
      'dataset_versions_counts_non_negative_ck',
      sql`${table.acceptedRows} >= 0 and ${table.rejectedRows} >= 0 and ${table.duplicateRows} >= 0 and ${table.ambiguousRows} >= 0`,
    ),
  ],
)

export const datasetRecords = model.table(
  'dataset_records',
  {
    datasetVersionId: uuid('dataset_version_id').notNull().references(() => datasetVersions.id, { onDelete: 'cascade' }),
    fixtureId: uuid('fixture_id').notNull().references(() => fixtures.id, { onDelete: 'restrict' }),
    resultRevisionId: uuid('result_revision_id').references(() => matchResultRevisions.id, { onDelete: 'restrict' }),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id').notNull(),
    recordSha256: text('record_sha256').notNull(),
    recordPayload: jsonb('record_payload').$type<Record<string, unknown>>().notNull(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetVersionId, table.sourceProvider, table.externalId] }),
    index('dataset_records_fixture_idx').on(table.fixtureId),
  ],
)

export const providerSnapshots = sports.table(
  'provider_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    datasetVersionId: uuid('dataset_version_id').notNull().references(() => datasetVersions.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    policyReference: text('policy_reference').notNull(),
    licenseReference: text('license_reference').notNull(),
    contentSha256: text('content_sha256').notNull(),
    recordCount: integer('record_count').notNull(),
    fetchedAt: utcTimestamp('fetched_at').notNull().defaultNow(),
  },
  (table) => [
    unique('provider_snapshots_dataset_provider_uq').on(table.datasetVersionId, table.provider),
  ],
)

export const dataQualityIssues = sports.table(
  'data_quality_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    datasetVersionId: uuid('dataset_version_id').references(() => datasetVersions.id, { onDelete: 'set null' }),
    issueType: text('issue_type').notNull(),
    sourceProvider: text('source_provider').notNull(),
    externalId: text('external_id'),
    message: text('message').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: dataQualityStatus('status').notNull().default('open'),
    resolution: jsonb('resolution').$type<Record<string, unknown>>(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    resolvedAt: utcTimestamp('resolved_at'),
  },
  (table) => [
    index('data_quality_issues_status_created_idx').on(table.status, table.createdAt),
    index('data_quality_issues_provider_external_idx').on(table.sourceProvider, table.externalId),
  ],
)

export const modelVersions = model.table(
  'model_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelKey: text('model_key').notNull(),
    version: integer('version').notNull(),
    datasetVersionId: uuid('dataset_version_id')
      .notNull()
      .references(() => datasetVersions.id, { onDelete: 'restrict' }),
    status: modelStatus('status').notNull(),
    minRows: integer('min_rows').notNull(),
    trainingRows: integer('training_rows').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    codeVersion: text('code_version').notNull(),
    featureSetVersion: text('feature_set_version').notNull(),
    modelSchemaVersion: text('model_schema_version').notNull(),
    hyperparameters: jsonb('hyperparameters').$type<Record<string, number | string | boolean>>().notNull(),
    artifactFingerprint: text('artifact_fingerprint').notNull(),
    trainedAt: utcTimestamp('trained_at').notNull().defaultNow(),
    activatedAt: utcTimestamp('activated_at'),
    retiredAt: utcTimestamp('retired_at'),
    sourceJobId: uuid('source_job_id'),
  },
  (table) => [
    unique('model_versions_key_version_uq').on(table.modelKey, table.version),
    unique('model_versions_payload_hash_uq').on(table.payloadSha256),
    unique('model_versions_artifact_fingerprint_uq').on(table.artifactFingerprint),
    uniqueIndex('model_versions_source_job_uidx')
      .on(table.sourceJobId)
      .where(sql`${table.sourceJobId} is not null`),
    index('model_versions_key_status_idx').on(table.modelKey, table.status),
    check(
      'model_versions_counts_ck',
      sql`${table.minRows} > 0 and ${table.trainingRows} >= 0`,
    ),
    check('model_versions_hash_ck', sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`),
  ],
)

export const modelPromotionEvents = model.table(
  'model_promotion_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelVersionId: uuid('model_version_id').notNull().references(() => modelVersions.id, { onDelete: 'restrict' }),
    previousChampionId: uuid('previous_champion_id').references(() => modelVersions.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    decision: jsonb('decision').$type<Record<string, unknown>>().notNull(),
    sourceJobId: uuid('source_job_id'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('model_promotion_events_model_created_idx').on(table.modelVersionId, table.createdAt),
    check('model_promotion_events_action_ck', sql`${table.action} in ('promote', 'reject', 'rollback')`),
  ],
)

export const modelSegments = model.table(
  'model_segments',
  {
    modelVersionId: uuid('model_version_id')
      .notNull()
      .references(() => modelVersions.id, { onDelete: 'cascade' }),
    market: text('market').notNull(),
    segmentKey: text('segment_key').notNull(),
    status: segmentStatus('status').notNull(),
    sampleSize: integer('sample_size').notNull(),
    probabilities: jsonb('probabilities').$type<Record<string, number>>().notNull(),
    positiveCounts: jsonb('positive_counts').$type<Record<string, number>>().notNull(),
    totalCounts: jsonb('total_counts').$type<Record<string, number>>().notNull(),
    reason: text('reason'),
  },
  (table) => [
    primaryKey({ columns: [table.modelVersionId, table.market, table.segmentKey] }),
    index('model_segments_market_status_idx').on(table.market, table.status),
    check('model_segments_sample_non_negative_ck', sql`${table.sampleSize} >= 0`),
  ],
)

export const predictions = model.table(
  'predictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: resourceScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    fixtureId: uuid('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'restrict' }),
    modelVersionId: uuid('model_version_id')
      .notNull()
      .references(() => modelVersions.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: predictionStatus('status').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    failureCode: text('failure_code'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    completedAt: utcTimestamp('completed_at'),
  },
  (table) => [
    unique('predictions_idempotency_uq').on(table.idempotencyKey),
    index('predictions_fixture_created_idx').on(table.fixtureId, table.createdAt),
    index('predictions_organization_created_idx').on(table.organizationId, table.createdAt),
    check(
      'predictions_scope_organization_ck',
      sql`(${table.scope} = 'system' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
  ],
)

export const evaluations = model.table(
  'evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelVersionId: uuid('model_version_id')
      .notNull()
      .references(() => modelVersions.id, { onDelete: 'cascade' }),
    kind: evaluationKind('kind').notNull(),
    generatedAt: utcTimestamp('generated_at').notNull(),
    trainRows: integer('train_rows').notNull(),
    testRows: integer('test_rows').notNull(),
    metrics: jsonb('metrics').$type<unknown[]>().notNull(),
    baselines: jsonb('baselines').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ignoredMarkets: jsonb('ignored_markets').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    ethicalNotice: text('ethical_notice').notNull(),
    sourceJobId: uuid('source_job_id'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('evaluations_model_kind_generated_uq').on(
      table.modelVersionId,
      table.kind,
      table.generatedAt,
    ),
    index('evaluations_kind_generated_idx').on(table.kind, table.generatedAt),
    uniqueIndex('evaluations_source_job_uidx')
      .on(table.sourceJobId)
      .where(sql`${table.sourceJobId} is not null`),
    check('evaluations_rows_non_negative_ck', sql`${table.trainRows} >= 0 and ${table.testRows} >= 0`),
  ],
)

export const exportStatus = ops.enum('export_status', [
  'pending',
  'processing',
  'available',
  'failed',
  'expired',
])
export const jobStatus = ops.enum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
export const operationalScope = ops.enum('operational_scope', ['system', 'organization'])

export const savedQueries = ops.table(
  'saved_queries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<{ league: string; period: string; market: string; query: string }>().notNull(),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('saved_queries_organization_user_name_uq').on(table.organizationId, table.createdByUserId, table.name),
    index('saved_queries_organization_updated_idx').on(table.organizationId, table.updatedAt),
    check('saved_queries_name_ck', sql`char_length(${table.name}) between 2 and 80`),
  ],
)

export const alertRules = ops.table(
  'alert_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    savedQueryId: uuid('saved_query_id').references(() => savedQueries.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    channel: text('channel').notNull().default('email'),
    status: text('status').notNull().default('paused'),
    deliveryState: text('delivery_state').notNull().default('not_configured'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('alert_rules_organization_updated_idx').on(table.organizationId, table.updatedAt),
    check('alert_rules_name_ck', sql`char_length(${table.name}) between 2 and 80`),
    check('alert_rules_channel_ck', sql`${table.channel} in ('email', 'in_app')`),
    check('alert_rules_status_ck', sql`${table.status} in ('paused', 'active')`),
    check('alert_rules_delivery_ck', sql`${table.deliveryState} in ('configured', 'not_configured', 'failed')`),
  ],
)

export const supportTickets = ops.table(
  'support_tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('open'),
    ownerTeam: text('owner_team').notNull().default('support'),
    encryptedContent: text('encrypted_content').notNull(),
    contentIv: text('content_iv').notNull(),
    contentAuthTag: text('content_auth_tag').notNull(),
    encryptionKeyVersion: text('encryption_key_version').notNull(),
    slaDueAt: utcTimestamp('sla_due_at').notNull(),
    resolvedAt: utcTimestamp('resolved_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('support_tickets_organization_status_idx').on(table.organizationId, table.status, table.createdAt),
    index('support_tickets_creator_created_idx').on(table.createdByUserId, table.createdAt),
    check('support_tickets_category_ck', sql`${table.category} in ('access','billing','data','privacy','security','technical','other')`),
    check('support_tickets_severity_ck', sql`${table.severity} in ('sev1','sev2','sev3','sev4')`),
    check('support_tickets_status_ck', sql`${table.status} in ('open','in_progress','waiting_customer','resolved')`),
    check('support_tickets_owner_ck', sql`${table.ownerTeam} in ('support','engineering','security','billing','privacy')`),
  ],
)

export const incidents = ops.table(
  'incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('investigating'),
    ownerTeam: text('owner_team').notNull(),
    encryptedContent: text('encrypted_content').notNull(),
    contentIv: text('content_iv').notNull(),
    contentAuthTag: text('content_auth_tag').notNull(),
    encryptionKeyVersion: text('encryption_key_version').notNull(),
    publicReference: text('public_reference'),
    startedAt: utcTimestamp('started_at').notNull().defaultNow(),
    resolvedAt: utcTimestamp('resolved_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('incidents_organization_status_idx').on(table.organizationId, table.status, table.createdAt),
    check('incidents_severity_ck', sql`${table.severity} in ('sev1','sev2','sev3','sev4')`),
    check('incidents_status_ck', sql`${table.status} in ('investigating','identified','monitoring','resolved')`),
    check('incidents_owner_ck', sql`${table.ownerTeam} in ('support','engineering','security','billing','privacy')`),
  ],
)

export const systemState = ops.table('system_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
})

export const exportsTable = ops.table(
  'exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    status: exportStatus('status').notNull().default('pending'),
    objectKey: text('object_key'),
    contentSha256: text('content_sha256'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    expiresAt: utcTimestamp('expires_at'),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('exports_organization_created_idx').on(table.organizationId, table.createdAt),
    check(
      'exports_available_metadata_ck',
      sql`${table.status} <> 'available' or (${table.objectKey} is not null and ${table.contentSha256} is not null and ${table.sizeBytes} is not null)`,
    ),
  ],
)

export const backgroundJobs = ops.table(
  'background_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: operationalScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    queue: text('queue').notNull(),
    jobType: text('job_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    scheduledAt: utcTimestamp('scheduled_at').notNull().defaultNow(),
    startedAt: utcTimestamp('started_at'),
    completedAt: utcTimestamp('completed_at'),
    failureCode: text('failure_code'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    requestId: uuid('request_id'),
    traceContext: jsonb('trace_context').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    datasetVersionId: uuid('dataset_version_id').references(() => datasetVersions.id, {
      onDelete: 'restrict',
    }),
    modelVersionId: uuid('model_version_id').references(() => modelVersions.id, {
      onDelete: 'restrict',
    }),
    dispatchedAt: utcTimestamp('dispatched_at'),
    dispatchAttempts: integer('dispatch_attempts').notNull().default(0),
    timeoutMs: integer('timeout_ms').notNull().default(900_000),
    cancelRequestedAt: utcTimestamp('cancel_requested_at'),
    resultMetadata: jsonb('result_metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('background_jobs_queue_idempotency_uq').on(table.queue, table.idempotencyKey),
    index('background_jobs_status_scheduled_idx').on(table.status, table.scheduledAt),
    index('background_jobs_organization_created_idx').on(table.organizationId, table.createdAt),
    check(
      'background_jobs_scope_organization_ck',
      sql`(${table.scope} = 'system' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
    check(
      'background_jobs_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check('background_jobs_dispatch_attempts_ck', sql`${table.dispatchAttempts} >= 0`),
    check('background_jobs_timeout_ck', sql`${table.timeoutMs} > 0`),
    index('background_jobs_queue_status_idx').on(table.queue, table.status, table.createdAt),
  ],
)

export const deadLetterJobs = ops.table(
  'dead_letter_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    backgroundJobId: uuid('background_job_id')
      .notNull()
      .references(() => backgroundJobs.id, { onDelete: 'restrict' }),
    scope: operationalScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    queue: text('queue').notNull(),
    jobType: text('job_type').notNull(),
    attempts: integer('attempts').notNull(),
    failureCode: text('failure_code').notNull(),
    requestId: uuid('request_id'),
    datasetVersionId: uuid('dataset_version_id').references(() => datasetVersions.id, {
      onDelete: 'restrict',
    }),
    modelVersionId: uuid('model_version_id').references(() => modelVersions.id, {
      onDelete: 'restrict',
    }),
    failedAt: utcTimestamp('failed_at').notNull().defaultNow(),
  },
  (table) => [
    unique('dead_letter_jobs_background_job_uq').on(table.backgroundJobId),
    index('dead_letter_jobs_queue_failed_idx').on(table.queue, table.failedAt),
    index('dead_letter_jobs_organization_failed_idx').on(table.organizationId, table.failedAt),
    check(
      'dead_letter_jobs_scope_organization_ck',
      sql`(${table.scope} = 'system' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
    check('dead_letter_jobs_attempts_ck', sql`${table.attempts} > 0`),
  ],
)

export const providerApiUsage = ops.table(
  'provider_api_usage',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    provider: text('provider').notNull(),
    periodType: text('period_type').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    quotaLimit: integer('quota_limit').notNull(),
    alertThreshold: integer('alert_threshold').notNull(),
    alertedAt: utcTimestamp('alerted_at'),
    updatedAt: utcTimestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('provider_api_usage_provider_period_uq').on(
      table.provider,
      table.periodType,
      table.periodStart,
    ),
    index('provider_api_usage_period_idx').on(
      table.provider,
      table.periodType,
      table.periodStart,
    ),
    check('provider_api_usage_period_ck', sql`${table.periodType} in ('daily', 'monthly')`),
    check(
      'provider_api_usage_counts_ck',
      sql`${table.requestCount} >= 0 and ${table.quotaLimit} > 0 and ${table.alertThreshold} > 0 and ${table.alertThreshold} <= ${table.quotaLimit}`,
    ),
  ],
)

export const auditLog = ops.table(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    scope: operationalScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    requestId: uuid('request_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: utcTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_organization_created_idx').on(table.organizationId, table.createdAt),
    index('audit_log_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('audit_log_target_idx').on(table.targetType, table.targetId, table.createdAt),
    check(
      'audit_log_scope_organization_ck',
      sql`(${table.scope} = 'system' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
  ],
)
