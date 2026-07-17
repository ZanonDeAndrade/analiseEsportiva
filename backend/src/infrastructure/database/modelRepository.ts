import { createHash } from 'node:crypto'
import { and, desc, eq, max, ne, sql } from 'drizzle-orm'
import type { ModelRepository } from '../../application/ports/persistence.js'
import type {
  BacktestReport,
  BetIntelModel,
  EvaluationReport,
  MarketModel,
  SegmentModel,
  PromotionDecision,
} from '../../schemas.js'
import type { BetIntelDatabase } from './client.js'
import {
  auditLog,
  datasetVersions,
  evaluations,
  modelSegments,
  modelPromotionEvents,
  modelVersions,
} from './schema.js'

const MODEL_KEY = 'betintel-probability-model'
const ETHICAL_NOTICE =
  'Analises historicas e probabilisticas nao garantem resultados futuros.'

export class PostgresModelRepository implements ModelRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async getActiveModel(): Promise<(BetIntelModel & { modelVersionId: string; datasetVersionId: string }) | null> {
    const rows = await this.db
      .select({ id: modelVersions.id, datasetVersionId: modelVersions.datasetVersionId, payload: modelVersions.payload })
      .from(modelVersions)
      .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))
      .orderBy(desc(modelVersions.version))
      .limit(1)

    return rows[0]
      ? {
          ...(rows[0].payload as unknown as BetIntelModel),
          modelVersionId: rows[0].id,
          datasetVersionId: rows[0].datasetVersionId,
        }
      : null
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
        throw new Error(
          'Treino recusado: importe ou sincronize um dataset versionado antes de salvar o modelo.',
        )
      }

      const versions = await tx
        .select({ version: max(modelVersions.version) })
        .from(modelVersions)
        .where(eq(modelVersions.modelKey, MODEL_KEY))
      const nextVersion = Number(versions[0]?.version ?? 0) + 1
      const payload = modelValue as unknown as Record<string, unknown>
      const payloadSha256 = sha256(JSON.stringify(payload))

      const existingArtifact = await tx
        .select({ id: modelVersions.id, version: modelVersions.version })
        .from(modelVersions)
        .where(eq(modelVersions.artifactFingerprint, modelValue.provenance.artifactFingerprint))
        .limit(1)
      if (existingArtifact[0]) return existingArtifact[0]

      const existingPayload = await tx
        .select({ id: modelVersions.id, version: modelVersions.version })
        .from(modelVersions)
        .where(eq(modelVersions.payloadSha256, payloadSha256))
        .limit(1)
      if (existingPayload[0]) return existingPayload[0]

      const inserted = await tx
        .insert(modelVersions)
        .values({
          modelKey: MODEL_KEY,
          version: nextVersion,
          datasetVersionId: selectedDatasetId,
          status: 'challenger',
          minRows: modelValue.minRows,
          trainingRows: modelValue.trainingRows,
          payload,
          payloadSha256,
          codeVersion: modelValue.provenance.codeVersion,
          featureSetVersion: modelValue.provenance.featureSetVersion,
          modelSchemaVersion: modelValue.provenance.modelSchemaVersion,
          hyperparameters: modelValue.provenance.hyperparameters,
          artifactFingerprint: modelValue.provenance.artifactFingerprint,
          trainedAt: modelValue.createdAt,
          sourceJobId,
        })
        .returning({ id: modelVersions.id, version: modelVersions.version })

      const segments = flattenSegments(inserted[0].id, modelValue.markets)
      if (segments.length > 0) await tx.insert(modelSegments).values(segments)
      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      await tx.insert(auditLog).values({
        scope: 'system',
        action: 'model.challenger_created',
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
      .where(and(eq(evaluations.kind, kind), sql`${evaluations.payload} @> '{"trace": {}}'::jsonb`))
      .orderBy(desc(evaluations.generatedAt))
      .limit(1)

    return rows[0]
      ? (rows[0].payload as unknown as EvaluationReport | BacktestReport)
      : null
  }

  async getChampionEvaluation(): Promise<EvaluationReport | null> {
    const rows = await this.db.select({ payload: evaluations.payload })
      .from(evaluations)
      .innerJoin(modelVersions, eq(evaluations.modelVersionId, modelVersions.id))
      .where(and(
        eq(evaluations.kind, 'evaluation'),
        eq(modelVersions.status, 'ready'),
        sql`${evaluations.payload} @> '{"trace": {}}'::jsonb`,
      ))
      .orderBy(desc(evaluations.generatedAt)).limit(1)
    return rows[0] ? (rows[0].payload as unknown as EvaluationReport) : null
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
        baselines: Object.fromEntries(report.metrics.map((metric) => [metric.market, metric.baselines])),
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

  async applyPromotionDecision(
    modelVersionId: string,
    decision: PromotionDecision,
    sourceJobId?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${MODEL_KEY}))`)
      const candidate = await tx.select({ id: modelVersions.id, status: modelVersions.status })
        .from(modelVersions).where(eq(modelVersions.id, modelVersionId)).limit(1)
      if (!candidate[0]) throw new Error('Model version candidata não encontrada.')
      const champion = await tx.select({ id: modelVersions.id }).from(modelVersions)
        .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))
        .orderBy(desc(modelVersions.version)).limit(1)

      if (decision.decision === 'promote') {
        await tx.update(modelVersions).set({
          status: 'retired', retiredAt: new Date().toISOString(),
        }).where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready'), ne(modelVersions.id, modelVersionId)))
        await tx.update(modelVersions).set({
          status: 'ready', activatedAt: new Date().toISOString(), retiredAt: null,
        }).where(eq(modelVersions.id, modelVersionId))
      } else if (decision.decision === 'reject') {
        await tx.update(modelVersions).set({ status: 'rejected' }).where(eq(modelVersions.id, modelVersionId))
      }

      if (decision.decision !== 'hold') {
        await tx.insert(modelPromotionEvents).values({
          modelVersionId,
          previousChampionId: champion[0]?.id,
          action: decision.decision,
          decision: decision as unknown as Record<string, unknown>,
          sourceJobId,
        })
      }
      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      await tx.insert(auditLog).values({
        scope: 'system',
        action: decision.decision === 'promote' ? 'model.promoted' : decision.decision === 'reject' ? 'model.rejected' : 'model.held',
        targetType: 'model_version',
        targetId: modelVersionId,
        metadata: { before: { championId: champion[0]?.id ?? null }, after: decision as unknown as Record<string, unknown> },
      })
    })
  }

  async rollbackModel(modelVersionId: string, reason: string, sourceJobId?: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${MODEL_KEY}))`)
      const target = await tx.select({ id: modelVersions.id, status: modelVersions.status })
        .from(modelVersions).where(and(eq(modelVersions.id, modelVersionId), eq(modelVersions.modelKey, MODEL_KEY))).limit(1)
      if (!target[0] || target[0].status !== 'retired') return false
      const champion = await tx.select({ id: modelVersions.id }).from(modelVersions)
        .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready'))).limit(1)
      await tx.update(modelVersions).set({ status: 'retired', retiredAt: new Date().toISOString() })
        .where(and(eq(modelVersions.modelKey, MODEL_KEY), eq(modelVersions.status, 'ready')))
      await tx.update(modelVersions).set({ status: 'ready', activatedAt: new Date().toISOString(), retiredAt: null })
        .where(eq(modelVersions.id, modelVersionId))
      await tx.insert(modelPromotionEvents).values({
        modelVersionId, previousChampionId: champion[0]?.id, action: 'rollback',
        decision: { reason }, sourceJobId,
      })
      await tx.execute(sql`select set_config('app.service_role', 'worker', true)`)
      await tx.insert(auditLog).values({
        scope: 'system', action: 'model.rollback', targetType: 'model_version', targetId: modelVersionId,
        metadata: { before: { championId: champion[0]?.id ?? null }, after: { reason, restoredModelVersionId: modelVersionId } },
      })
      return true
    })
  }

  async listModelVersions() {
    const rows = await this.db.select({
      id: modelVersions.id,
      version: modelVersions.version,
      status: modelVersions.status,
      datasetVersionId: modelVersions.datasetVersionId,
      codeVersion: modelVersions.codeVersion,
      featureSetVersion: modelVersions.featureSetVersion,
      artifactFingerprint: modelVersions.artifactFingerprint,
      trainedAt: modelVersions.trainedAt,
      activatedAt: modelVersions.activatedAt,
    }).from(modelVersions).where(eq(modelVersions.modelKey, MODEL_KEY)).orderBy(desc(modelVersions.version)).limit(100)
    return rows.map((row) => ({ ...row, activatedAt: row.activatedAt ?? undefined }))
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
