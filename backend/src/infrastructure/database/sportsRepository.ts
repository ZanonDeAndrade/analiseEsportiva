import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, gt, gte, lte, max, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type {
  FixtureQuery,
  SportsImportBatch,
  SportsImportResult,
  SportsRepository,
  AliasReview,
  DataFreshnessSummary,
  DataQualityIssue,
  NormalizedSportsRecord,
} from '../../application/ports/persistence.js'
import type { CompetitionSummary, CsvRow, FixtureRecord } from '../../schemas.js'
import type { BetIntelDatabase } from './client.js'
import {
  auditLog,
  competitions,
  competitionExternalIds,
  dataQualityIssues,
  datasetRecords,
  datasetVersions,
  fixtures,
  matchResultRevisions,
  matchResults,
  matchStats,
  providerSnapshots,
  seasons,
  seasonExternalIds,
  teamAliases,
  teams,
} from './schema.js'
import { fixtureFreshnessMs } from '../../config.js'
import { recordFingerprint } from '../../domain/sportsData.js'

const homeTeams = alias(teams, 'home_teams')
const awayTeams = alias(teams, 'away_teams')

export class PostgresSportsRepository implements SportsRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async listFixtures(query: FixtureQuery = {}): Promise<FixtureRecord[]> {
    const conditions = []

    if (!query.includePast) {
      conditions.push(gt(fixtures.startsAt, new Date().toISOString()))
      conditions.push(gt(fixtures.freshUntil, new Date().toISOString()))
    }
    if (query.from) conditions.push(gte(fixtures.startsAt, query.from))
    if (query.to) conditions.push(lte(fixtures.startsAt, query.to))
    if (query.competition) {
      conditions.push(
        or(
          eq(competitions.externalId, query.competition),
          eq(competitions.name, query.competition),
        )!,
      )
    }

    const rows = await this.db
      .select(fixtureSelection())
      .from(fixtures)
      .innerJoin(competitions, eq(fixtures.competitionId, competitions.id))
      .leftJoin(seasons, eq(fixtures.seasonId, seasons.id))
      .innerJoin(homeTeams, eq(fixtures.homeTeamId, homeTeams.id))
      .innerJoin(awayTeams, eq(fixtures.awayTeamId, awayTeams.id))
      .where(and(...conditions))
      .orderBy(asc(fixtures.startsAt))

    return rows.map(toFixtureRecord)
  }

  async findFixture(id: string | number): Promise<FixtureRecord | null> {
    const value = String(id)
    const rows = await this.db
      .select(fixtureSelection())
      .from(fixtures)
      .innerJoin(competitions, eq(fixtures.competitionId, competitions.id))
      .leftJoin(seasons, eq(fixtures.seasonId, seasons.id))
      .innerJoin(homeTeams, eq(fixtures.homeTeamId, homeTeams.id))
      .innerJoin(awayTeams, eq(fixtures.awayTeamId, awayTeams.id))
      .where(or(eq(fixtures.externalId, value), eq(fixtures.id, value)))
      .limit(1)

    return rows[0] ? toFixtureRecord(rows[0]) : null
  }

  async listCompetitions(): Promise<CompetitionSummary[]> {
    const rows = await this.db
      .select({
        id: competitions.externalId,
        name: competitions.name,
        provider: competitions.sourceProvider,
        season: max(seasons.label),
        fixtures: count(fixtures.id),
        updatedAt: max(fixtures.updatedAt),
      })
      .from(competitions)
      .leftJoin(seasons, eq(seasons.competitionId, competitions.id))
      .leftJoin(fixtures, eq(fixtures.competitionId, competitions.id))
      .groupBy(
        competitions.id,
        competitions.externalId,
        competitions.name,
        competitions.sourceProvider,
      )
      .orderBy(asc(competitions.name))

    return rows.map((row) => ({
      ...row,
      fixtures: Number(row.fixtures),
      season: row.season ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    }))
  }

  async readTrainingRows(datasetVersionId?: string): Promise<CsvRow[]> {
    if (datasetVersionId) {
      const snapshotRows = await this.db.select({ payload: datasetRecords.recordPayload })
        .from(datasetRecords)
        .where(eq(datasetRecords.datasetVersionId, datasetVersionId))
        .orderBy(asc(datasetRecords.externalId))
      return snapshotRows
        .map((row) => normalizedRecordToCsv(row.payload))
        .filter((row): row is CsvRow => row !== null)
    }
    const rows = await this.db
      .select({
        league: competitions.name,
        competition: competitions.name,
        season: seasons.label,
        startsAt: fixtures.startsAt,
        homeTeam: homeTeams.canonicalName,
        awayTeam: awayTeams.canonicalName,
        homeGoals: matchResults.homeGoals,
        awayGoals: matchResults.awayGoals,
        outcome: matchResults.outcome,
        homeCorners: matchStats.homeCorners,
        awayCorners: matchStats.awayCorners,
        homeYellowCards: matchStats.homeYellowCards,
        awayYellowCards: matchStats.awayYellowCards,
        homeRedCards: matchStats.homeRedCards,
        awayRedCards: matchStats.awayRedCards,
        sourceProvider: fixtures.sourceProvider,
        updatedAt: fixtures.sourceUpdatedAt,
      })
      .from(matchResults)
      .innerJoin(fixtures, eq(matchResults.fixtureId, fixtures.id))
      .innerJoin(competitions, eq(fixtures.competitionId, competitions.id))
      .leftJoin(seasons, eq(fixtures.seasonId, seasons.id))
      .innerJoin(homeTeams, eq(fixtures.homeTeamId, homeTeams.id))
      .innerJoin(awayTeams, eq(fixtures.awayTeamId, awayTeams.id))
      .leftJoin(matchStats, eq(matchStats.fixtureId, fixtures.id))
      .orderBy(asc(fixtures.startsAt), asc(fixtures.id))

    return rows.map((row) => ({
      League: row.league,
      Competition: row.competition,
      Season: row.season ?? '',
      Date: row.startsAt.slice(0, 10),
      HomeTeam: row.homeTeam,
      AwayTeam: row.awayTeam,
      FTHG: String(row.homeGoals),
      FTAG: String(row.awayGoals),
      FTR: row.outcome,
      HC: optionalNumber(row.homeCorners),
      AC: optionalNumber(row.awayCorners),
      HY: optionalNumber(row.homeYellowCards),
      AY: optionalNumber(row.awayYellowCards),
      HR: optionalNumber(row.homeRedCards),
      AR: optionalNumber(row.awayRedCards),
      SourceProvider: row.sourceProvider,
      UpdatedAt: row.updatedAt ?? '',
    }))
  }

  async importBatch(batch: SportsImportBatch): Promise<SportsImportResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${batch.contentSha256}, 0))`,
      )

      const alreadyImported = await tx
        .select({ id: datasetVersions.id })
        .from(datasetVersions)
        .where(eq(datasetVersions.contentSha256, batch.contentSha256))
        .limit(1)

      if (alreadyImported[0]) {
        return {
          datasetVersionId: alreadyImported[0].id,
          accepted: 0,
          inserted: 0,
          duplicates: batch.records.length,
          correctedResults: 0,
          alreadyImported: true,
        }
      }

      const currentVersion = await tx
        .select({ version: max(datasetVersions.version) })
        .from(datasetVersions)
        .where(eq(datasetVersions.datasetKey, batch.datasetKey))
      const nextVersion = Number(currentVersion[0]?.version ?? 0) + 1
      const providers = [...new Set(batch.records.map((record) => record.sourceProvider))]
      const dataset = await tx
        .insert(datasetVersions)
        .values({
          datasetKey: batch.datasetKey,
          version: nextVersion,
          contentSha256: batch.contentSha256,
          status: 'building',
          acceptedRows: batch.records.length,
          rejectedRows: batch.rejectedRows,
          duplicateRows: batch.duplicateRows,
          ambiguousRows: batch.ambiguousRows,
          sourceProviders: providers,
        })
        .returning({ id: datasetVersions.id })

      const competitionCache = new Map<string, string>()
      const seasonCache = new Map<string, string>()
      const teamCache = new Map<string, string>()
      let inserted = 0
      let duplicates = batch.duplicateRows
      let correctedResults = 0

      for (const record of batch.records) {
        const competitionKey = `${record.sourceProvider}\u0000${record.competitionExternalId}`
        let competitionId = competitionCache.get(competitionKey)
        if (!competitionId) {
          const mappedCompetition = await tx.select({ id: competitionExternalIds.competitionId })
            .from(competitionExternalIds).where(and(
              eq(competitionExternalIds.sourceProvider, record.sourceProvider),
              eq(competitionExternalIds.externalId, record.competitionExternalId),
            )).limit(1)
          competitionId = mappedCompetition[0]?.id
          if (!competitionId) {
            const competitionKeyValue = canonicalKey(record.competitionName)
            const canonicalCompetition = await tx.select({ id: competitions.id }).from(competitions)
              .where(eq(competitions.canonicalKey, competitionKeyValue)).limit(1)
            competitionId = canonicalCompetition[0]?.id
            if (!competitionId) {
              const insertedCompetition = await tx.insert(competitions).values({
                sourceProvider: record.sourceProvider,
                externalId: record.competitionExternalId,
                canonicalKey: competitionKeyValue,
                name: record.competitionName,
              }).returning({ id: competitions.id })
              competitionId = insertedCompetition[0].id
            }
            await tx.insert(competitionExternalIds).values({
              competitionId,
              sourceProvider: record.sourceProvider,
              externalId: record.competitionExternalId,
            }).onConflictDoNothing()
          }
          competitionCache.set(competitionKey, competitionId)
        }

        let seasonId: string | undefined
        if (record.seasonExternalId && record.seasonLabel) {
          const seasonKey = `${record.sourceProvider}\u0000${record.seasonExternalId}`
          seasonId = seasonCache.get(seasonKey)
          if (!seasonId) {
            const mappedSeason = await tx.select({ id: seasonExternalIds.seasonId }).from(seasonExternalIds)
              .where(and(eq(seasonExternalIds.sourceProvider, record.sourceProvider), eq(seasonExternalIds.externalId, record.seasonExternalId))).limit(1)
            seasonId = mappedSeason[0]?.id
            if (!seasonId) {
              const seasonKeyValue = `${canonicalKey(record.competitionName)}:${canonicalKey(record.seasonLabel)}`
              const canonicalSeason = await tx.select({ id: seasons.id }).from(seasons)
                .where(eq(seasons.canonicalKey, seasonKeyValue)).limit(1)
              seasonId = canonicalSeason[0]?.id
              if (!seasonId) {
                const insertedSeason = await tx.insert(seasons).values({
                  competitionId,
                  sourceProvider: record.sourceProvider,
                  externalId: record.seasonExternalId,
                  canonicalKey: seasonKeyValue,
                  label: record.seasonLabel,
                }).returning({ id: seasons.id })
                seasonId = insertedSeason[0].id
              }
              await tx.insert(seasonExternalIds).values({
                seasonId,
                sourceProvider: record.sourceProvider,
                externalId: record.seasonExternalId,
              }).onConflictDoNothing()
            }
            seasonCache.set(seasonKey, seasonId)
          }
        }

        const resolveTeam = async (team: typeof record.homeTeam) => {
          const teamKey = `${record.sourceProvider}\u0000${team.externalId}`
          let teamId = teamCache.get(teamKey)
          if (!teamId) {
            const mappedTeam = await tx.select({ id: teamAliases.teamId }).from(teamAliases)
              .where(and(eq(teamAliases.sourceProvider, record.sourceProvider), eq(teamAliases.externalId, team.externalId))).limit(1)
            teamId = mappedTeam[0]?.id
            if (!teamId) {
              const canonicalTeam = await tx.select({ id: teams.id }).from(teams)
                .where(eq(teams.canonicalKey, canonicalKey(team.name))).limit(1)
              teamId = canonicalTeam[0]?.id
            }
            if (!teamId) {
              const insertedTeam = await tx.insert(teams).values({
                sourceProvider: record.sourceProvider,
                externalId: team.externalId,
                canonicalKey: canonicalKey(team.name),
                canonicalName: team.name,
              }).returning({ id: teams.id })
              teamId = insertedTeam[0].id
            }
            teamCache.set(teamKey, teamId)
          }

          const aliasConflict = await tx.select({
            id: teamAliases.id,
            teamId: teamAliases.teamId,
            externalId: teamAliases.externalId,
          }).from(teamAliases).where(and(
            eq(teamAliases.sourceProvider, record.sourceProvider),
            eq(teamAliases.normalizedAlias, team.normalizedAlias),
          )).limit(1)
          if (aliasConflict[0] && aliasConflict[0].externalId !== team.externalId) {
            await tx.update(teamAliases).set({ reviewStatus: 'pending' })
              .where(eq(teamAliases.id, aliasConflict[0].id))
            await tx.insert(dataQualityIssues).values({
              datasetVersionId: dataset[0].id,
              issueType: 'ambiguous_team_alias',
              sourceProvider: record.sourceProvider,
              externalId: team.externalId,
              message: `Alias "${team.alias}" possui mais de um identificador externo.`,
              payload: {
                normalizedAlias: team.normalizedAlias,
                existingExternalId: aliasConflict[0].externalId,
                candidateExternalId: team.externalId,
                existingTeamId: aliasConflict[0].teamId,
                candidateTeamId: teamId,
              },
            })
            return aliasConflict[0].teamId
          }

          await tx
            .insert(teamAliases)
            .values({
              teamId,
              sourceProvider: record.sourceProvider,
              alias: team.alias,
              normalizedAlias: team.normalizedAlias,
              externalId: team.externalId,
            })
            .onConflictDoUpdate({
              target: [teamAliases.sourceProvider, teamAliases.externalId],
              set: { alias: team.alias, normalizedAlias: team.normalizedAlias },
            })

          return teamId
        }

        const homeTeamId = await resolveTeam(record.homeTeam)
        const awayTeamId = await resolveTeam(record.awayTeam)
        const existing = await tx
          .select({ id: fixtures.id })
          .from(fixtures)
          .where(
            and(
              eq(fixtures.sourceProvider, record.sourceProvider),
              eq(fixtures.externalId, record.externalId),
            ),
          )
          .limit(1)

        const insertedFixture = await tx
          .insert(fixtures)
          .values({
            sourceProvider: record.sourceProvider,
            externalId: record.externalId,
            competitionId,
            seasonId,
            homeTeamId,
            awayTeamId,
            startsAt: record.startsAt,
            status: record.status,
            rawStatus: record.rawStatus,
            round: record.round,
            sourceUpdatedAt: record.sourceUpdatedAt,
            lastSeenAt: sql`now()`,
            freshUntil: freshUntil(record.sourceUpdatedAt, record.status),
          })
          .onConflictDoUpdate({
            target: [fixtures.sourceProvider, fixtures.externalId],
            set: {
              competitionId,
              seasonId,
              homeTeamId,
              awayTeamId,
              startsAt: record.startsAt,
              status: record.status,
              rawStatus: record.rawStatus,
              round: record.round,
              sourceUpdatedAt: record.sourceUpdatedAt,
              lastSeenAt: sql`now()`,
              freshUntil: freshUntil(record.sourceUpdatedAt, record.status),
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: fixtures.id })
        const fixtureId = insertedFixture[0].id

        if (existing[0]) duplicates += 1
        else inserted += 1

        let resultRevisionId: string | undefined
        if (record.result) {
          const previousResult = await tx
            .select({
              homeGoals: matchResults.homeGoals,
              awayGoals: matchResults.awayGoals,
              outcome: matchResults.outcome,
              revision: matchResults.revision,
              decision: matchResults.decision,
              winner: matchResults.winner,
              homeExtraTimeGoals: matchResults.homeExtraTimeGoals,
              awayExtraTimeGoals: matchResults.awayExtraTimeGoals,
              homePenaltyGoals: matchResults.homePenaltyGoals,
              awayPenaltyGoals: matchResults.awayPenaltyGoals,
            })
            .from(matchResults)
            .where(eq(matchResults.fixtureId, fixtureId))
            .limit(1)
          const resultChanged = Boolean(
            previousResult[0]
            && (
              previousResult[0].homeGoals !== record.result.homeGoals
              || previousResult[0].awayGoals !== record.result.awayGoals
              || previousResult[0].outcome !== record.result.outcome
              || previousResult[0].decision !== record.result.decision
              || previousResult[0].winner !== record.result.winner
              || previousResult[0].homeExtraTimeGoals !== (record.result.homeExtraTimeGoals ?? null)
              || previousResult[0].awayExtraTimeGoals !== (record.result.awayExtraTimeGoals ?? null)
              || previousResult[0].homePenaltyGoals !== (record.result.homePenaltyGoals ?? null)
              || previousResult[0].awayPenaltyGoals !== (record.result.awayPenaltyGoals ?? null)
            )
          )
          if (resultChanged) correctedResults += 1
          const revision = previousResult[0]
            ? previousResult[0].revision + Number(resultChanged)
            : 1
          const resultHash = sha256(JSON.stringify(record.result))
          const revisionRow = await tx
            .insert(matchResultRevisions)
            .values({
              fixtureId,
              revision,
              sourceProvider: record.sourceProvider,
              recordSha256: resultHash,
              ...record.result,
              sourceUpdatedAt: record.sourceUpdatedAt,
            })
            .onConflictDoNothing()
            .returning({ id: matchResultRevisions.id })
          if (revisionRow[0]) resultRevisionId = revisionRow[0].id
          else {
            const currentRevision = await tx
              .select({ id: matchResultRevisions.id })
              .from(matchResultRevisions)
              .where(and(eq(matchResultRevisions.fixtureId, fixtureId), eq(matchResultRevisions.recordSha256, resultHash)))
              .limit(1)
            resultRevisionId = currentRevision[0]?.id
          }
          await tx
            .insert(matchResults)
            .values({
              fixtureId,
              sourceProvider: record.sourceProvider,
              externalId: `${record.externalId}:result`,
              homeGoals: record.result.homeGoals,
              awayGoals: record.result.awayGoals,
              outcome: record.result.outcome,
              decision: record.result.decision,
              winner: record.result.winner,
              homeExtraTimeGoals: record.result.homeExtraTimeGoals,
              awayExtraTimeGoals: record.result.awayExtraTimeGoals,
              homePenaltyGoals: record.result.homePenaltyGoals,
              awayPenaltyGoals: record.result.awayPenaltyGoals,
              revision,
              sourceUpdatedAt: record.sourceUpdatedAt,
            })
            .onConflictDoUpdate({
              target: matchResults.fixtureId,
              set: {
                homeGoals: record.result.homeGoals,
                awayGoals: record.result.awayGoals,
                outcome: record.result.outcome,
                decision: record.result.decision,
                winner: record.result.winner,
                homeExtraTimeGoals: record.result.homeExtraTimeGoals,
                awayExtraTimeGoals: record.result.awayExtraTimeGoals,
                homePenaltyGoals: record.result.homePenaltyGoals,
                awayPenaltyGoals: record.result.awayPenaltyGoals,
                revision,
                sourceUpdatedAt: record.sourceUpdatedAt,
              },
            })
        }

        if (record.stats) {
          const previousStats = await tx.select({
            homeCorners: matchStats.homeCorners,
            awayCorners: matchStats.awayCorners,
            homeYellowCards: matchStats.homeYellowCards,
            awayYellowCards: matchStats.awayYellowCards,
            homeRedCards: matchStats.homeRedCards,
            awayRedCards: matchStats.awayRedCards,
          }).from(matchStats).where(eq(matchStats.fixtureId, fixtureId)).limit(1)
          if (previousStats[0] && !sameStats(previousStats[0], record.stats)) correctedResults += 1
          await tx
            .insert(matchStats)
            .values({
              fixtureId,
              sourceProvider: record.sourceProvider,
              externalId: `${record.externalId}:stats`,
              ...record.stats,
            })
            .onConflictDoUpdate({
              target: matchStats.fixtureId,
              set: record.stats,
            })
        }

        await tx.insert(datasetRecords).values({
          datasetVersionId: dataset[0].id,
          fixtureId,
          resultRevisionId,
          sourceProvider: record.sourceProvider,
          externalId: record.externalId,
          recordSha256: sha256(recordFingerprint(record)),
          recordPayload: record as unknown as Record<string, unknown>,
        }).onConflictDoNothing()
      }

      if (batch.providerPolicies?.length) {
        await tx.insert(providerSnapshots).values(batch.providerPolicies.map((policy) => ({
          datasetVersionId: dataset[0].id,
          provider: policy.provider,
          policyReference: policy.policyReference,
          licenseReference: policy.licenseReference,
          contentSha256: batch.contentSha256,
          recordCount: batch.records.filter((record) => providerMatchesPolicy(record.sourceProvider, policy.provider)).length,
        }))).onConflictDoNothing()
      }

      if (batch.issues?.length) {
        await tx.insert(dataQualityIssues).values(batch.issues.map((item) => ({
          datasetVersionId: dataset[0].id,
          issueType: item.code,
          sourceProvider: item.source,
          externalId: String(item.row),
          message: item.message,
          payload: item.payload ?? {},
        })))
      }

      await tx
        .update(datasetVersions)
        .set({ status: 'ready' })
        .where(eq(datasetVersions.id, dataset[0].id))

      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      await tx.insert(auditLog).values({
        scope: 'system',
        action: 'dataset.version_imported',
        targetType: 'dataset_version',
        targetId: dataset[0].id,
        metadata: {
          before: null,
          after: {
            accepted: batch.records.length,
            inserted,
            duplicates,
            correctedResults,
            rejected: batch.rejectedRows,
            ambiguous: batch.ambiguousRows,
          },
        },
      })

      return {
        datasetVersionId: dataset[0].id,
        accepted: batch.records.length,
        inserted,
        duplicates,
        correctedResults,
        alreadyImported: false,
      }
    })
  }

  async previewImport(
    batch: SportsImportBatch,
  ): Promise<{ datasetVersionId: string | null; existingRecords: number }> {
    const dataset = await this.db
      .select({ id: datasetVersions.id })
      .from(datasetVersions)
      .where(eq(datasetVersions.contentSha256, batch.contentSha256))
      .limit(1)

    let existingRecords = 0
    for (let offset = 0; offset < batch.records.length; offset += 100) {
      const chunk = batch.records.slice(offset, offset + 100)
      if (chunk.length === 0) continue
      const matches = await this.db
        .select({ id: fixtures.id })
        .from(fixtures)
        .where(
          or(
            ...chunk.map((record) =>
              and(
                eq(fixtures.sourceProvider, record.sourceProvider),
                eq(fixtures.externalId, record.externalId),
              ),
            ),
          ),
        )
      existingRecords += matches.length
    }

    return { datasetVersionId: dataset[0]?.id ?? null, existingRecords }
  }

  async listDataQualityIssues(status: DataQualityIssue['status'] = 'open'): Promise<DataQualityIssue[]> {
    const rows = await this.db.select().from(dataQualityIssues)
      .where(eq(dataQualityIssues.status, status)).orderBy(desc(dataQualityIssues.createdAt)).limit(200)
    return rows.map((row) => ({
      id: row.id,
      issueType: row.issueType,
      sourceProvider: row.sourceProvider,
      externalId: row.externalId ?? undefined,
      status: row.status,
      message: row.message,
      payload: row.payload,
      resolution: row.resolution ?? undefined,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? undefined,
    }))
  }

  async resolveDataQualityIssue(id: string, resolution: Record<string, unknown>): Promise<boolean> {
    const updated = await this.db.update(dataQualityIssues).set({
      status: 'resolved', resolution, resolvedAt: new Date().toISOString(),
    }).where(and(eq(dataQualityIssues.id, id), eq(dataQualityIssues.status, 'open'))).returning({ id: dataQualityIssues.id })
    return Boolean(updated[0])
  }

  async listAliasReviews(status?: AliasReview['reviewStatus']): Promise<AliasReview[]> {
    const rows = await this.db.select({
      id: teamAliases.id,
      sourceProvider: teamAliases.sourceProvider,
      alias: teamAliases.alias,
      normalizedAlias: teamAliases.normalizedAlias,
      teamId: teamAliases.teamId,
      canonicalName: teams.canonicalName,
      reviewStatus: teamAliases.reviewStatus,
      createdAt: teamAliases.createdAt,
      reviewedAt: teamAliases.reviewedAt,
    }).from(teamAliases).innerJoin(teams, eq(teamAliases.teamId, teams.id))
      .where(status ? eq(teamAliases.reviewStatus, status) : undefined)
      .orderBy(desc(teamAliases.createdAt)).limit(200)
    return rows.map((row) => ({ ...row, reviewedAt: row.reviewedAt ?? undefined }))
  }

  async reviewAlias(id: string, status: 'approved' | 'rejected'): Promise<boolean> {
    const updated = await this.db.update(teamAliases).set({
      reviewStatus: status, reviewedAt: new Date().toISOString(),
    }).where(eq(teamAliases.id, id)).returning({ id: teamAliases.id })
    return Boolean(updated[0])
  }

  async dataFreshnessSummary(): Promise<DataFreshnessSummary> {
    const now = new Date().toISOString()
    const rows = await this.db.select({
      current: count(sql`case when ${fixtures.lastSeenAt} is not null and ${fixtures.freshUntil} > ${now} then 1 end`),
      stale: count(sql`case when ${fixtures.lastSeenAt} is not null and ${fixtures.freshUntil} <= ${now} then 1 end`),
      missingTimestamp: count(sql`case when ${fixtures.lastSeenAt} is null then 1 end`),
      oldestSourceTimestamp: sql<string | null>`min(coalesce(${fixtures.sourceUpdatedAt}, ${fixtures.lastSeenAt}))`,
      newestSourceTimestamp: sql<string | null>`max(coalesce(${fixtures.sourceUpdatedAt}, ${fixtures.lastSeenAt}))`,
    }).from(fixtures)
    return {
      current: Number(rows[0]?.current ?? 0),
      stale: Number(rows[0]?.stale ?? 0),
      missingTimestamp: Number(rows[0]?.missingTimestamp ?? 0),
      oldestSourceTimestamp: rows[0]?.oldestSourceTimestamp ?? undefined,
      newestSourceTimestamp: rows[0]?.newestSourceTimestamp ?? undefined,
      checkedAt: now,
    }
  }
}

function fixtureSelection() {
  return {
    id: fixtures.id,
    externalId: fixtures.externalId,
    sourceProvider: fixtures.sourceProvider,
    competition: competitions.name,
    leagueId: competitions.externalId,
    season: seasons.label,
    round: fixtures.round,
    startsAt: fixtures.startsAt,
    status: fixtures.rawStatus,
    normalizedStatus: fixtures.status,
    homeTeam: homeTeams.canonicalName,
    awayTeam: awayTeams.canonicalName,
    updatedAt: fixtures.sourceUpdatedAt,
    lastSeenAt: fixtures.lastSeenAt,
    freshUntil: fixtures.freshUntil,
  }
}

function toFixtureRecord(row: ReturnType<typeof fixtureSelection> extends infer T ? { [K in keyof T]: unknown } : never): FixtureRecord {
  const startsAt = String(row.startsAt)
  const kickoff = new Date(startsAt)

  return {
    id: String(row.externalId),
    fixtureId: numericId(String(row.externalId)),
    competition: String(row.competition),
    leagueId: String(row.leagueId),
    league: String(row.competition),
    season: row.season ? String(row.season) : undefined,
    round: row.round ? String(row.round) : undefined,
    date: kickoff.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    time: kickoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    isoDate: startsAt,
    status: row.status ? String(row.status) : String(row.normalizedStatus),
    normalizedStatus: String(row.normalizedStatus),
    homeTeam: String(row.homeTeam),
    awayTeam: String(row.awayTeam),
    sourceProvider: String(row.sourceProvider),
    updatedAt: row.updatedAt ? String(row.updatedAt) : String(row.lastSeenAt),
    freshUntil: String(row.freshUntil),
    freshness: new Date(String(row.freshUntil)).getTime() > Date.now() ? 'current' : 'stale',
  }
}

function optionalNumber(value: number | null) {
  return value === null ? '' : String(value)
}

function numericId(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function canonicalKey(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function freshUntil(sourceUpdatedAt: string | undefined, status: string) {
  const observedAt = sourceUpdatedAt ? new Date(sourceUpdatedAt) : new Date()
  return new Date(observedAt.getTime() + fixtureFreshnessMs(status)).toISOString()
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function sameStats(
  left: Record<string, number | null>,
  right: Record<string, number | undefined>,
) {
  return Object.entries(right).every(([key, value]) => left[key] === (value ?? null))
}

function normalizedRecordToCsv(payload: Record<string, unknown>): CsvRow | null {
  const record = payload as unknown as NormalizedSportsRecord
  if (!record.result || !record.homeTeam || !record.awayTeam) return null
  return {
    League: record.leagueName,
    Competition: record.competitionName,
    Season: record.seasonLabel ?? '',
    Date: record.startsAt.slice(0, 10),
    HomeTeam: record.homeTeam.name,
    AwayTeam: record.awayTeam.name,
    FTHG: String(record.result.homeGoals),
    FTAG: String(record.result.awayGoals),
    FTR: record.result.outcome,
    HC: optionalSnapshotNumber(record.stats?.homeCorners),
    AC: optionalSnapshotNumber(record.stats?.awayCorners),
    HY: optionalSnapshotNumber(record.stats?.homeYellowCards),
    AY: optionalSnapshotNumber(record.stats?.awayYellowCards),
    HR: optionalSnapshotNumber(record.stats?.homeRedCards),
    AR: optionalSnapshotNumber(record.stats?.awayRedCards),
    SourceProvider: record.sourceProvider,
    UpdatedAt: record.sourceUpdatedAt ?? '',
    ResultDecision: record.result.decision,
    HomePenaltyGoals: optionalSnapshotNumber(record.result.homePenaltyGoals),
    AwayPenaltyGoals: optionalSnapshotNumber(record.result.awayPenaltyGoals),
  }
}

function optionalSnapshotNumber(value: number | undefined) {
  return value === undefined ? undefined : String(value)
}

function providerMatchesPolicy(sourceProvider: string, configuredProvider: string) {
  if (sourceProvider === configuredProvider || sourceProvider.startsWith(configuredProvider)) return true
  return configuredProvider === 'football-data' && sourceProvider === 'football-data.co.uk'
}
