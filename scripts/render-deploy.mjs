const apiBase = (process.env.RENDER_API_BASE_URL ?? 'https://api.render.com/v1').replace(/\/$/, '')
const token = required('RENDER_API_TOKEN')
const imageUrl = required('DEPLOY_IMAGE_URL')
const smokeBaseUrl = required('SMOKE_BASE_URL').replace(/\/$/, '')
const serviceIds = required('RENDER_SERVICE_IDS').split(',').map((value) => value.trim()).filter(Boolean)
const pollIntervalMs = positiveInteger('RENDER_POLL_INTERVAL_MS', 5_000)
const deployTimeoutMs = positiveInteger('RENDER_DEPLOY_TIMEOUT_MS', 20 * 60_000)
const rollbackDrill = process.env.FORCE_ROLLBACK_DRILL === 'true'
const changed = []

if (serviceIds.length === 0) throw new Error('RENDER_SERVICE_IDS must not be empty.')
if (!imageUrl.includes('@sha256:')) throw new Error('DEPLOY_IMAGE_URL must use an immutable digest.')

try {
  for (const serviceId of serviceIds) {
    const previous = await currentLiveDeploy(serviceId)
    if (!previous) throw new Error('No live deploy is available for rollback.')
    const deploy = await triggerDeploy(serviceId, imageUrl, previous.id)
    await waitForDeploy(serviceId, deploy.id)
    changed.push({ serviceId, previousDeployId: previous.id })
    event('service_deployed', { serviceId, deployId: deploy.id })
  }

  await smoke()

  if (rollbackDrill) {
    await rollbackChanged()
    await smoke()
    event('rollback_drill_passed', { services: changed.length })
  } else {
    event('deployment_passed', { services: changed.length })
  }
} catch (error) {
  event('deployment_failed', { reason: safeReason(error) }, true)
  await rollbackChanged()
  process.exitCode = 1
}

async function currentLiveDeploy(serviceId) {
  const deploys = await listDeploys(serviceId)
  return deploys.find((deploy) => deploy.status === 'live')
}

async function triggerDeploy(serviceId, nextImageUrl, previousDeployId) {
  const startedAt = new Date().toISOString()
  const payload = await api('/services/' + encodeURIComponent(serviceId) + '/deploys', {
    method: 'POST',
    body: JSON.stringify({ imageUrl: nextImageUrl }),
  })
  const direct = unwrapDeploy(payload)
  if (direct?.id) return direct

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await delay(2_000)
    const deploys = await listDeploys(serviceId)
    const created = deploys.find((deploy) =>
      deploy.id !== previousDeployId && (!deploy.createdAt || deploy.createdAt >= startedAt))
    if (created) return created
  }
  throw new Error('Render accepted the deploy but did not return its identifier.')
}

async function waitForDeploy(serviceId, deployId) {
  const deadline = Date.now() + deployTimeoutMs
  while (Date.now() < deadline) {
    const payload = await api(
      '/services/' + encodeURIComponent(serviceId) + '/deploys/' + encodeURIComponent(deployId),
    )
    const deploy = unwrapDeploy(payload)
    if (deploy?.status === 'live') return
    if (deploy?.status && /(fail|cancel)/i.test(deploy.status)) {
      throw new Error('Render deploy reached a terminal failure state.')
    }
    await delay(pollIntervalMs)
  }
  throw new Error('Render deploy timed out.')
}

async function listDeploys(serviceId) {
  const payload = await api('/services/' + encodeURIComponent(serviceId) + '/deploys?limit=20')
  const values = Array.isArray(payload) ? payload : payload?.deploys ?? []
  return values.map(unwrapDeploy).filter(Boolean)
}

async function rollbackChanged() {
  for (const item of [...changed].reverse()) {
    try {
      const payload = await api('/services/' + encodeURIComponent(item.serviceId) + '/rollback', {
        method: 'POST',
        body: JSON.stringify({ deployId: item.previousDeployId }),
      })
      const rollback = unwrapDeploy(payload)
      if (rollback?.id) await waitForDeploy(item.serviceId, rollback.id)
      event('service_rolled_back', {
        serviceId: item.serviceId,
        targetDeployId: item.previousDeployId,
      })
    } catch (error) {
      event('rollback_failed', {
        serviceId: item.serviceId,
        reason: safeReason(error),
      }, true)
      process.exitCode = 1
    }
  }
}

async function smoke() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const live = await health('/v1/health/live')
      const ready = await health('/v1/health/ready')
      if (
        live.status === 'ok'
        && ready.status === 'ok'
        && ready.dependencies?.postgresql === 'up'
        && ready.dependencies?.redis === 'up'
      ) {
        event('smoke_passed', { attempt })
        return
      }
    } catch {
      // Retry only within the bounded deployment convergence window.
    }
    if (attempt < 30) await delay(5_000)
  }
  throw new Error('Smoke test failed after deployment.')
}

async function health(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(smokeBaseUrl + path, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Health endpoint returned non-success.')
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function api(path, init = {}) {
  const response = await fetch(apiBase + path, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) throw new Error('Render API request failed with status ' + response.status + '.')
  const text = await response.text()
  return text ? JSON.parse(text) : {}
}

function unwrapDeploy(value) {
  if (!value || typeof value !== 'object') return undefined
  const deploy = value.deploy && typeof value.deploy === 'object' ? value.deploy : value
  if (typeof deploy.id !== 'string') return undefined
  return {
    id: deploy.id,
    status: typeof deploy.status === 'string' ? deploy.status : undefined,
    createdAt: typeof deploy.createdAt === 'string' ? deploy.createdAt : undefined,
  }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(name + ' is required.')
  return value
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + ' must be positive.')
  return value
}

function safeReason(error) {
  return error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url]') : 'unknown_error'
}

function event(name, fields, error = false) {
  const output = JSON.stringify({ event: name, ...fields })
  if (error) console.error(output)
  else console.log(output)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
