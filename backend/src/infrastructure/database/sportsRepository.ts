import { and, asc, count, eq, gt, gte, lte, max, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type {
  FixtureQuery,
  SportsImportBatch,
  SportsImportResult,
  SportsRepository,
} from '../../application/ports/persistence.js'
import type { CompetitionSummary, CsvRow, FixtureRecord } from '../../schemas.js'
import type { BetIntelDatabase } from './client.js'
import {
  auditLog,
  competitions,
  datasetVersions,
  fixtures,
  matchResults,
  matchStats,
  seasons,
  teamAliases,
  teams,
} from './schema.js'

const homeTeams = alias(teams, 'home_teams')
const awayTeams = alias(teams, 'away_teams')

export class PostgresSportsRepository implements SportsRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async listFixtures(query: FixtureQuery = {}): Promise<FixtureRecord[]> {
    const conditions = []

    if (!query.includePast) conditions.push(gt(fixtures.startsAt, new Date().toISOString()))
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

  async readTrainingRows(): Promise<CsvRow[]> {
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
          const insertedCompetition = await tx
            .insert(competitions)
            .values({
              sourceProvider: record.sourceProvider,
              externalId: record.competitionExternalId,
              name: record.competitionName,
            })
            .onConflictDoUpdate({
              target: [competitions.sourceProvider, competitions.externalId],
              set: { name: record.competitionName, updatedAt: sql`now()` },
            })
            .returning({ id: competitions.id })
          competitionId = insertedCompetition[0].id
          competitionCache.set(competitionKey, competitionId)
        }

        let seasonId: string | undefined
        if (record.seasonExternalId && record.seasonLabel) {
          const seasonKey = `${record.sourceProvider}\u0000${record.seasonExternalId}`
          seasonId = seasonCache.get(seasonKey)
          if (!seasonId) {
            const insertedSeason = await tx
              .insert(seasons)
              .values({
                competitionId,
                sourceProvider: record.sourceProvider,
                externalId: record.seasonExternalId,
                label: record.seasonLabel,
              })
              .onConflictDoUpdate({
                target: [seasons.sourceProvider, seasons.externalId],
                set: {
                  competitionId,
                  label: record.seasonLabel,
                  updatedAt: sql`now()`,
                },
              })
              .returning({ id: seasons.id })
            seasonId = insertedSeason[0].id
            seasonCache.set(seasonKey, seasonId)
          }
        }

        const resolveTeam = async (team: typeof record.homeTeam) => {
          const teamKey = `${record.sourceProvider}\u0000${team.externalId}`
          let teamId = teamCache.get(teamKey)
          if (!teamId) {
            const insertedTeam = await tx
              .insert(teams)
              .values({
                sourceProvider: record.sourceProvider,
                externalId: team.externalId,
                canonicalName: team.name,
              })
              .onConflictDoUpdate({
                target: [teams.sourceProvider, teams.externalId],
                set: { canonicalName: team.name, updatedAt: sql`now()` },
              })
              .returning({ id: teams.id })
            teamId = insertedTeam[0].id
            teamCache.set(teamKey, teamId)
          }

          await tx
            .insert(teamAliases)
            .values({
              teamId,
              sourceProvider: record.sourceProvider,
              alias: team.alias,
              normalizedAlias: team.normalizedAlias,
            })
            .onConflictDoUpdate({
              target: [teamAliases.sourceProvider, teamAliases.normalizedAlias],
              set: { alias: team.alias, teamId },
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
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: fixtures.id })
        const fixtureId = insertedFixture[0].id

        if (existing[0]) duplicates += 1
        else inserted += 1

        if (record.result) {
          const previousResult = await tx
            .select({
              homeGoals: matchResults.homeGoals,
              awayGoals: matchResults.awayGoals,
              outcome: matchResults.outcome,
            })
            .from(matchResults)
            .where(eq(matchResults.fixtureId, fixtureId))
            .limit(1)
          if (
            previousResult[0]
            && (
              previousResult[0].homeGoals !== record.result.homeGoals
              || previousResult[0].awayGoals !== record.result.awayGoals
              || previousResult[0].outcome !== record.result.outcome
            )
          ) {
            correctedResults += 1
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
              sourceUpdatedAt: record.sourceUpdatedAt,
            })
            .onConflictDoUpdate({
              target: matchResults.fixtureId,
              set: {
                homeGoals: record.result.homeGoals,
                awayGoals: record.result.awayGoals,
                outcome: record.result.outcome,
                sourceUpdatedAt: record.sourceUpdatedAt,
              },
            })
        }

        if (record.stats) {
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
    homeTeam: String(row.homeTeam),
    awayTeam: String(row.awayTeam),
    sourceProvider: String(row.sourceProvider),
    updatedAt: row.updatedAt ? String(row.updatedAt) : startsAt,
  }
}

function optionalNumber(value: number | null) {
  return value === null ? '' : String(value)
}

function numericId(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
