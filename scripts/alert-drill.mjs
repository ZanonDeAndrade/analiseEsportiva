import { randomUUID, createHash } from 'node:crypto'

const webhookUrl = requiredUrl('ALERT_DRILL_WEBHOOK_URL')
const acknowledgementUrl = requiredUrl('ALERT_DRILL_ACK_URL')
const environment = required('BETINTEL_ENVIRONMENT')
const bearer = process.env.ALERT_DRILL_BEARER_TOKEN?.trim()
const timeoutMs = positiveInteger('ALERT_DRILL_TIMEOUT_MS', 10 * 60_000)
const drillId = randomUUID()

await request(webhookUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
  },
  body: JSON.stringify({
    schemaVersion: 1,
    event: 'synthetic_availability_alert',
    alert: 'BetIntelSyntheticAvailabilityDrill',
    severity: 'critical',
    environment,
    drillId,
    summary: 'Ensaio controlado: confirmar recebimento e reconhecer no canal de plantão.',
  }),
})
event('alert_drill_delivered', { drillId, environment })

const deadline = Date.now() + timeoutMs
while (Date.now() < deadline) {
  await delay(5_000)
  const url = new URL(acknowledgementUrl)
  url.searchParams.set('drillId', drillId)
  const response = await request(url.toString(), {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
  const body = await response.json().catch(() => ({}))
  if (body?.acknowledged === true && typeof body?.acknowledgementId === 'string') {
    event('alert_drill_human_acknowledged', {
      drillId,
      acknowledgementRef: createHash('sha256').update(body.acknowledgementId).digest('hex').slice(0, 16),
    })
    process.exit(0)
  }
}

event('alert_drill_ack_timeout', { drillId, timeoutMs }, true)
process.exitCode = 1

async function request(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`alert_provider_http_${response.status}`)
    return response
  } finally {
    clearTimeout(timeout)
  }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function requiredUrl(name) {
  const value = required(name)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`)
  return value
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be positive.`)
  return value
}

function event(name, fields, error = false) {
  const output = JSON.stringify({ event: name, ...fields })
  if (error) console.error(output)
  else console.log(output)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

