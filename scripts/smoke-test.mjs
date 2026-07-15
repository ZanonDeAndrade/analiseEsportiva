const baseUrl = required('SMOKE_BASE_URL').replace(/\/$/, '')
const attempts = positiveInteger('SMOKE_ATTEMPTS', 30)
const intervalMs = positiveInteger('SMOKE_INTERVAL_MS', 5_000)

let passed = false
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const live = await health('/v1/health/live')
    const ready = await health('/v1/health/ready')
    if (
      live.status === 'ok'
      && ready.status === 'ok'
      && ready.dependencies?.postgresql === 'up'
      && ready.dependencies?.redis === 'up'
    ) {
      console.log(JSON.stringify({ event: 'smoke_passed', attempt }))
      passed = true
      break
    }
  } catch {
    // The next bounded attempt handles transient deployment convergence.
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs))
}

if (!passed) {
  console.error(JSON.stringify({ event: 'smoke_failed', attempts }))
  process.exitCode = 1
}

async function health(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`health_${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be positive.`)
  return value
}
