import { createHash } from 'node:crypto'
import { and, desc, eq, max, sql } from 'drizzle-orm'
import type { ModelRepository } from '../../application/ports/persistence.js'
import type {
  BacktestReport,
  BetIntelModel,
  EvaluationReport,
  MarketModel,
  SegmentModel,
} from '../../schemas.js'
import type { BetIntelDatabase } from './client.js'
import {
  auditLog,
  datasetVersions,
  evaluations,
  modelSegments,
  modelVersions,
} from './schema.js'

const MODEL_KEY = 'betintel-probability-model'
const ETHICAL_NOTICE =
  'Analises historicas e probabilisticas nao garantem resultados futuros.'

export class PostgresModelRepository implements ModelRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async getActiveModel(): Promise<BetIntelModel | null> {
    const rows = await this.db
      .select({ payload: modelVersions.payload })
      .from(modelVersions)
      .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))
      .orderBy(desc(modelVersions.version))
      .limit(1)

    return rows[0] ? (rows[0].payload as unknown as BetIntelModel) : null
  }

  async saveModel(
    modelValue: BetIntelModel,
    datasetVersionId?: string,
    sourceJobId?: string,
  ): Promise<{ id: string; version: number }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${MODEL_KEY}))`)

      if (sourceJobId) {
        const existingJob = await tx
          .select({ id: modelVersions.id, version: modelVersions.version })
          .from(modelVersions)
          .where(eq(modelVersions.sourceJobId, sourceJobId))
          .limit(1)
        if (existingJob[0]) return existingJob[0]
      }

      let selectedDatasetId = datasetVersionId
      if (!selectedDatasetId) {
        const latestDataset = await tx
          .select({ id: datasetVersions.id })
          .from(datasetVersions)
          .where(eq(datasetVersions.status, 'ready'))
          .orderBy(desc(datasetVersions.createdAt))
          .limit(1)
        selectedDatasetId = latestDataset[0]?.id
      }

      if (!selectedDatasetId) {
        const versions = await tx
          .select({ version: max(datasetVersions.version) })
          .from(datasetVersions)
          .where(eq(datasetVersions.datasetKey, 'runtime-training'))
        const datasetHash = sha256(
          JSON.stringify({
            trainingRows: modelValue.trainingRows,
            providers: modelValue.sourceProviders,
            updatedAt: modelValue.updatedAt,
          }),
        )
        const insertedDataset = await tx
          .insert(datasetVersions)
          .values({
            datasetKey: 'runtime-training',
            version: Number(versions[0]?.version ?? 0) + 1,
            contentSha256: datasetHash,
            status: 'ready',
            acceptedRows: modelValue.trainingRows,
            sourceProviders: modelValue.sourceProviders,
          })
          .onConflictDoUpdate({
            target: datasetVersions.contentSha256,
            set: { status: 'ready' },
          })
          .returning({ id: datasetVersions.id })
        selectedDatasetId = insertedDataset[0].id
      }

      const versions = await tx
        .select({ version: max(modelVersions.version) })
        .from(modelVersions)
        .where(eq(modelVersions.modelKey, MODEL_KEY))
      const nextVersion = Number(versions[0]?.version ?? 0) + 1
      const payload = modelValue as unknown as Record<string, unknown>
      const payloadSha256 = sha256(JSON.stringify(payload))

      const existingPayload = await tx
        .select({ id: modelVersions.id, version: modelVersions.version })
        .from(modelVersions)
        .where(eq(modelVersions.payloadSha256, payloadSha256))
        .limit(1)
      if (existingPayload[0]) return existingPayload[0]

      await tx
        .update(modelVersions)
        .set({ status: 'retired', retiredAt: new Date().toISOString() })
        .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))

      const inserted = await tx
        .insert(modelVersions)
        .values({
          modelKey: MODEL_KEY,
          version: nextVersion,
          datasetVersionId: selectedDatasetId,
          status: 'ready',
          minRows: modelValue.minRows,
          trainingRows: modelValue.trainingRows,
          payload,
          payloadSha256,
          trainedAt: modelValue.createdAt,
          activatedAt: new Date().toISOString(),
          sourceJobId,
        })
        .returning({ id: modelVersions.id, version: modelVersions.version })

      const segments = flattenSegments(inserted[0].id, modelValue.markets)
      if (segments.length > 0) await tx.insert(modelSegments).values(segments)
      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      await tx.insert(auditLog).values({
        scope: 'system',
        action: 'model.version_activated',
        targetType: 'model_version',
        targetId: inserted[0].id,
        metadata: {
          before: null,
          after: {
            version: inserted[0].version,
            datasetVersionId: selectedDatasetId,
            sourceJobId,
          },
        },
      })

      return inserted[0]
    })
  }

  async getLatestEvaluation(kind: 'evaluation'): Promise<EvaluationReport | null>
  async getLatestEvaluation(kind: 'backtest'): Promise<BacktestReport | null>
  async getLatestEvaluation(
    kind: 'evaluation' | 'backtest',
  ): Promise<EvaluationReport | BacktestReport | null> {
    const rows = await this.db
      .select({ payload: evaluations.payload })
      .from(evaluations)
      .where(eq(evaluations.kind, kind))
      .orderBy(desc(evaluations.generatedAt))
      .limit(1)

    return rows[0]
      ? (rows[0].payload as unknown as EvaluationReport | BacktestReport)
      : null
  }

  async saveEvaluation(kind: 'evaluation', report: EvaluationReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
  async saveEvaluation(kind: 'backtest', report: BacktestReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
  async saveEvaluation(
    kind: 'evaluation' | 'backtest',
    report: EvaluationReport | BacktestReport,
    sourceJobId?: string,
    modelVersionId?: string,
  ): Promise<void> {
    if (sourceJobId) {
      const existing = await this.db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(eq(evaluations.sourceJobId, sourceJobId))
        .limit(1)
      if (existing[0]) return
    }

    const active = modelVersionId
      ? await this.db
          .select({ id: modelVersions.id })
          .from(modelVersions)
          .where(eq(modelVersions.id, modelVersionId))
          .limit(1)
      : await this.db
          .select({ id: modelVersions.id })
          .from(modelVersions)
          .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))
          .orderBy(desc(modelVersions.version))
          .limit(1)

    if (!active[0]) throw new Error('Nao existe model_version ativo para associar a avaliacao.')

    const evaluation = kind === 'evaluation' ? (report as EvaluationReport) : null
    const backtest = kind === 'backtest' ? (report as BacktestReport) : null

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      const inserted = await tx.insert(evaluations).values({
        modelVersionId: active[0].id,
        kind,
        generatedAt: report.generatedAt,
        trainRows: evaluation?.trainRows ?? backtest?.initialWindow ?? 0,
        testRows: evaluation?.testRows ?? backtest?.evaluatedRows ?? 0,
        metrics: report.metrics,
        ignoredMarkets: evaluation?.ignoredMarkets ?? [],
        payload: report as unknown as Record<string, unknown>,
        ethicalNotice: ETHICAL_NOTICE,
        sourceJobId,
      }).onConflictDoNothing().returning({ id: evaluations.id })
      if (inserted[0]) {
        await tx.insert(auditLog).values({
          scope: 'system',
          action: kind === 'backtest' ? 'model.backtest_recorded' : 'model.evaluation_recorded',
          targetType: 'evaluation',
          targetId: inserted[0].id,
          metadata: {
            before: null,
            after: { kind, modelVersionId: active[0].id, sourceJobId },
          },
        })
      }
    })
  }
}

function flattenSegments(modelVersionId: string, markets: BetIntelModel['markets']) {
  return Object.values(markets).flatMap((market) => {
    const values: SegmentModel[] = [
      ...(market.global ? [market.global] : []),
      ...Object.values(market.segments),
    ]

    return values.map((segment) => segmentRow(modelVersionId, market, segment))
  })
}

function segmentRow(modelVersionId: string, market: MarketModel, segment: SegmentModel) {
  return {
    modelVersionId,
    market: market.market,
    segmentKey: segment.segmentKey,
    status: segment.status,
    sampleSize: segment.sampleSize,
    probabilities: segment.probabilities,
    positiveCounts: segment.positiveCounts,
    totalCounts: segment.totalCounts,
    reason: segment.reason,
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
