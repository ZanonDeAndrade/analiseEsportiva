import { runBacktest } from '../../backtesting.js'
import { evaluateModel } from '../../evaluation.js'
import { buildFeatureTable } from '../../featureEngineering.js'
import type { PostgresTrainingLock } from '../../infrastructure/database/trainingLock.js'
import type { ExternalRequestGuard } from '../../infrastructure/queue/externalRequests.js'
import type { SafeJobLogger } from '../../infrastructure/queue/logging.js'
import type {
  JobExecutionContext,
  JobProcessor,
} from '../../infrastructure/queue/workerRuntime.js'
import { syncData } from '../../syncData.js'
import { DEFAULT_MLOPS_SEED, trainModel } from '../../training.js'
import type { PersistenceRepositories } from '../ports/persistence.js'
import {
  SystemJobTypes,
  type InternalJobStore,
  type SystemJobType,
} from '../ports/jobs.js'
import type { ProviderQuotaLimits } from '../../infrastructure/database/providerQuota.js'
import { assessPromotion, computePerformanceDrift } from '../../mlops.js'
import { PrivacyRetentionCoordinator } from '../privacyCoordinator.js'

export interface JobProcessorDependencies {
  repositories: PersistenceRepositories
  jobs: InternalJobStore
  trainingLock: PostgresTrainingLock
  externalRequests: ExternalRequestGuard
  logger: SafeJobLogger
  quotas: {
    apiFootball: ProviderQuotaLimits
    footballData: ProviderQuotaLimits
    footballDataOrg: ProviderQuotaLimits
  }
  apiFootballMinimumGapMs: number
}

export function createJobProcessors(
  dependencies: JobProcessorDependencies,
): ReadonlyMap<SystemJobType, JobProcessor> {
  return new Map<SystemJobType, JobProcessor>([
    [SystemJobTypes.SPORTS_SYNC, ingestionProcessor(dependencies)],
    [SystemJobTypes.SPORTS_NORMALIZATION, normalizationProcessor(dependencies)],
    [SystemJobTypes.MODEL_TRAINING, trainingProcessor(dependencies)],
    [SystemJobTypes.EVALUATION, evaluationProcessor(dependencies)],
    [SystemJobTypes.BACKTEST, backtestProcessor(dependencies)],
    [SystemJobTypes.PRIVACY_RETENTION, retentionProcessor(dependencies)],
  ])
}

function retentionProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    await context.throwIfCancelled()
    const result = await new PrivacyRetentionCoordinator(dependencies.repositories.privacy).purgeExpired()
    await context.throwIfCancelled()
    return { metadata: { ...result, containsPii: false } }
  }
}

function ingestionProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    const apiFootballFetcher = (url: string, init?: { headers?: Record<string, string> }) =>
      dependencies.externalRequests.execute({
        provider: 'api-football',
        limits: dependencies.quotas.apiFootball,
        minimumGapMs: dependencies.apiFootballMinimumGapMs,
        signal: context.signal,
        operation: () => fetch(url, { ...init, signal: context.signal }),
        maxAttempts: 3,
      })
    const footballDataFetcher = (url: string) =>
      dependencies.externalRequests.execute({
        provider: 'football-data',
        limits: dependencies.quotas.footballData,
        minimumGapMs: 0,
        signal: context.signal,
        operation: () => fetch(url, { signal: context.signal }),
        maxAttempts: 3,
      })
    const footballDataOrgFetcher = (url: string, init?: { headers?: Record<string, string> }) =>
      dependencies.externalRequests.execute({
        provider: 'football-data-org',
        limits: dependencies.quotas.footballDataOrg,
        minimumGapMs: 6_000,
        signal: context.signal,
        operation: () => fetch(url, { ...init, signal: context.signal }),
        maxAttempts: 3,
      })
    const report = await syncData(dependencies.repositories, {
      apiFootballFetcher,
      footballDataFetcher,
      footballDataOrgFetcher,
      beforePersist: context.throwIfCancelled,
    })
    await context.throwIfCancelled()
    await enqueueNormalizationAfterIngestion(dependencies.jobs, context, report)
    return {
      datasetVersionId: report.datasetVersionId ?? undefined,
      metadata: {
        acceptedRows: report.acceptedRows,
        correctedResults: report.correctedResults,
        simulated: false,
      },
    }
  }
}

export async function enqueueNormalizationAfterIngestion(
  jobs: InternalJobStore,
  context: Pick<
    JobExecutionContext,
    'jobId' | 'requestId' | 'requestedByUserId'
  >,
  report: { datasetVersionId: string | null; correctedResults: number },
) {
  if (!report.datasetVersionId) return null
  return jobs.enqueueRelatedJob({
    type: SystemJobTypes.SPORTS_NORMALIZATION,
    idempotencyKey: `dataset:${report.datasetVersionId}`,
    datasetVersionId: report.datasetVersionId,
    requestId: context.requestId,
    requestedByUserId: context.requestedByUserId,
    parentJobId: context.jobId,
    payload: {
      correctionCount: report.correctedResults,
      reason: report.correctedResults > 0 ? 'corrected-results' : 'new-ingestion',
    },
  })
}

function normalizationProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    const datasetVersionId = await requiredDatasetVersion(context, dependencies.jobs)
    const rows = await dependencies.repositories.sports.readTrainingRows(datasetVersionId)
    await context.throwIfCancelled()
    const featureTable = buildFeatureTable(rows)
    await dependencies.repositories.systemState.set(`normalized_dataset:${datasetVersionId}`, {
      datasetVersionId,
      acceptedRows: featureTable.records.length,
      rejectedRows: featureTable.rejectedRows.length,
      reason: stringPayload(context, 'reason') ?? 'ingestion',
      generatedAt: new Date().toISOString(),
    })
    await dependencies.jobs.enqueueRelatedJob({
      type: SystemJobTypes.MODEL_TRAINING,
      idempotencyKey: `dataset:${datasetVersionId}`,
      datasetVersionId,
      requestId: context.requestId,
      requestedByUserId: context.requestedByUserId,
      parentJobId: context.jobId,
      payload: { minRows: numberPayload(context, 'minRows') ?? 5 },
    })
    return {
      datasetVersionId,
      metadata: {
        acceptedRows: featureTable.records.length,
        rejectedRows: featureTable.rejectedRows.length,
      },
    }
  }
}

function trainingProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    const datasetVersionId = await requiredDatasetVersion(context, dependencies.jobs)
    return dependencies.trainingLock.runExclusive(datasetVersionId, async () => {
      const rows = await dependencies.repositories.sports.readTrainingRows(datasetVersionId)
      await context.throwIfCancelled()
      const featureTable = buildFeatureTable(rows)
      const seed = mlopsSeed(context)
      const model = trainModel(featureTable.records, {
        minRows: numberPayload(context, 'minRows') ?? 5,
        seed,
        codeVersion: process.env.APP_RELEASE?.trim() ?? 'development',
      })
      await context.throwIfCancelled()
      const saved = await dependencies.repositories.models.saveModel(
        model,
        datasetVersionId,
        context.jobId,
      )
      for (const type of [SystemJobTypes.EVALUATION, SystemJobTypes.BACKTEST] as const) {
        await dependencies.jobs.enqueueRelatedJob({
          type,
          idempotencyKey: `model:${saved.id}`,
          datasetVersionId,
          modelVersionId: saved.id,
          requestId: context.requestId,
          requestedByUserId: context.requestedByUserId,
          parentJobId: context.jobId,
          payload: { seed },
        })
      }
      return {
        datasetVersionId,
        modelVersionId: saved.id,
        metadata: { modelVersion: saved.version, trainingRows: featureTable.records.length },
      }
    })
  }
}

function evaluationProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    const rows = await dependencies.repositories.sports.readTrainingRows(context.datasetVersionId)
    await context.throwIfCancelled()
    const features = buildFeatureTable(rows)
    const report = evaluateModel(features.records, {
      minRows: numberPayload(context, 'minRows') ?? 5,
      validationRatio: numberPayload(context, 'validationRatio') ?? 0.2,
      testRatio: numberPayload(context, 'testRatio') ?? 0.2,
      seed: mlopsSeed(context),
      datasetVersionId: context.datasetVersionId,
      modelVersionId: context.modelVersionId,
      codeVersion: process.env.APP_RELEASE?.trim() ?? 'development',
    })
    const champion = await dependencies.repositories.models.getChampionEvaluation()
    report.performanceDrift = computePerformanceDrift(report.metrics, champion?.metrics)
    report.promotion = assessPromotion(report.metrics, champion?.metrics)
    if (report.drift.status === 'critical' && report.promotion.decision === 'promote') {
      report.promotion = {
        ...report.promotion,
        decision: 'hold',
        reasons: [...report.promotion.reasons, 'Drift de dados critico bloqueia promocao automatica.'],
      }
    }
    await context.throwIfCancelled()
    await dependencies.repositories.models.saveEvaluation(
      'evaluation',
      report,
      context.jobId,
      context.modelVersionId,
    )
    if (!context.modelVersionId) throw new Error('Avaliação sem modelVersionId não pode decidir promoção.')
    await dependencies.repositories.models.applyPromotionDecision(
      context.modelVersionId,
      report.promotion,
      context.jobId,
    )
    return {
      datasetVersionId: context.datasetVersionId,
      modelVersionId: context.modelVersionId,
      metadata: { generatedAt: report.generatedAt },
    }
  }
}

function backtestProcessor(dependencies: JobProcessorDependencies): JobProcessor {
  return async (context) => {
    const rows = await dependencies.repositories.sports.readTrainingRows(context.datasetVersionId)
    await context.throwIfCancelled()
    const features = buildFeatureTable(rows)
    const minRows = numberPayload(context, 'minRows') ?? 5
    const report = runBacktest(features.records, {
      minRows,
      initialWindow: numberPayload(context, 'initialWindow') ?? minRows,
      seed: mlopsSeed(context),
      datasetVersionId: context.datasetVersionId,
      modelVersionId: context.modelVersionId,
      codeVersion: process.env.APP_RELEASE?.trim() ?? 'development',
    })
    await context.throwIfCancelled()
    await dependencies.repositories.models.saveEvaluation(
      'backtest',
      report,
      context.jobId,
      context.modelVersionId,
    )
    return {
      datasetVersionId: context.datasetVersionId,
      modelVersionId: context.modelVersionId,
      metadata: { generatedAt: report.generatedAt },
    }
  }
}

function mlopsSeed(context: JobExecutionContext): number {
  const payloadSeed = numberPayload(context, 'seed')
  if (payloadSeed !== undefined) return payloadSeed

  const configured = process.env.MLOPS_SEED?.trim()
  if (!configured) return DEFAULT_MLOPS_SEED
  if (!/^\d+$/.test(configured)) throw new Error('MLOPS_SEED deve ser um inteiro nao negativo.')
  const seed = Number(configured)
  if (!Number.isSafeInteger(seed)) throw new Error('MLOPS_SEED esta fora do intervalo seguro.')
  return seed
}

async function requiredDatasetVersion(
  context: JobExecutionContext,
  jobs: InternalJobStore,
) {
  const id = context.datasetVersionId ?? await jobs.latestReadyDatasetVersionId()
  if (!id) throw new Error('Nenhum dataset pronto esta disponivel.')
  return id
}

function numberPayload(context: JobExecutionContext, key: string) {
  const value = context.payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringPayload(context: JobExecutionContext, key: string) {
  const value = context.payload[key]
  return typeof value === 'string' ? value : undefined
}
