import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let envLoaded = false

export function loadLocalEnv() {
  if (envLoaded) return
  envLoaded = true

  const envPath = resolve('.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

export function dataDir() {
  loadLocalEnv()
  return resolve(process.env.BETINTEL_DATA_DIR ?? 'backend/data')
}

export function modelPath() {
  loadLocalEnv()
  return resolve(process.env.BETINTEL_MODEL_PATH ?? 'backend/artifacts/model.json')
}

export function backendPort() {
  loadLocalEnv()
  return Number(process.env.BETINTEL_BACKEND_PORT ?? 3333)
}

export function artifactPath(name: string) {
  return resolve('backend/artifacts', name)
}

/** Numero de dias a frente que devem ser carregados (rolante, padrao 7). */
export function fixtureWindowDays() {
  loadLocalEnv()
  const raw = Number(process.env.BETINTEL_FIXTURE_DAYS ?? 7)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7
}

/**
 * Janela rolante de fixtures: de hoje ate hoje + BETINTEL_FIXTURE_DAYS.
 * Se BETINTEL_FIXTURE_TO estiver definido explicitamente, ele tem prioridade
 * (mantem compatibilidade com configuracoes antigas).
 */
export function fixtureWindow(now = new Date()) {
  loadLocalEnv()
  const days = fixtureWindowDays()
  const from = now.toISOString().slice(0, 10)

  const horizon = new Date(now)
  horizon.setUTCDate(horizon.getUTCDate() + days)

  const explicitTo = process.env.BETINTEL_FIXTURE_TO?.trim()
  const to = explicitTo ? explicitTo : horizon.toISOString().slice(0, 10)

  return { from, to, days }
}
