import {
  schedulerDatabaseUrl,
  schedulerIntervalMs,
  shutdownGracePeriodMs,
  validateRuntimeConfiguration,
} from './config.js'
import { SystemJobTypes } from './application/ports/jobs.js'
import {
  assertSafeRuntimeDatabaseRole,
  createDatabaseConnection,
} from './infrastructure/database/client.js'
import { createPostgresRepositories } from './infrastructure/database/repositories.js'
import { installGracefulShutdown } from './runtime/gracefulShutdown.js'
import { shutdownTelemetry } from './telemetry/instrumentation.js'

validateRuntimeConfiguration('scheduler')
const connection = createDatabaseConnection(schedulerDatabaseUrl())
await assertSafeRuntimeDatabaseRole(connection)
const repositories = createPostgresRepositories(connection)
const intervalMs = schedulerIntervalMs()
let running = false

await scheduleJobs()
const timer = setInterval(() => void scheduleJobs(), intervalMs)

async function scheduleJobs() {
  await scheduleIngestion()
  const bucket = new Date().toISOString().slice(0, 10)
  await repositories.jobs.enqueueScheduledSystemJob(
    SystemJobTypes.PRIVACY_RETENTION,
    `scheduled:${bucket}`,
    { trigger: 'scheduler', bucket, containsPii: false },
  )
}

async function scheduleIngestion() {
  if (running) return
  running = true
  try {
    const bucket = new Date().toISOString().slice(0, 10)
    const job = await repositories.jobs.enqueueScheduledSystemJob(
      SystemJobTypes.SPORTS_SYNC,
      `scheduled:${bucket}`,
      { trigger: 'scheduler', bucket },
    )
    console.log(JSON.stringify({ event: 'ingestion_scheduled', jobId: job.id, bucket }))
  } finally {
    running = false
  }
}

installGracefulShutdown({
  processName: 'scheduler',
  timeoutMs: shutdownGracePeriodMs(),
  close: async () => {
    clearInterval(timer)
    await connection.close()
    await shutdownTelemetry()
  },
})
