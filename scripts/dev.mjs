import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const backendPort = Number(process.env.PORT ?? process.env.BETINTEL_BACKEND_PORT ?? 3333)
const backendUrl = `http://127.0.0.1:${backendPort}`
const children = []
let shuttingDown = false

await run(npm, ['run', 'backend:build'])

if (await isBackendHealthy()) {
  console.log(`BetIntel backend ja ativo em ${backendUrl}; reutilizando.`)
} else if (await isPortOpen('127.0.0.1', backendPort)) {
  console.error(`A porta ${backendPort} ja esta em uso, mas ${backendUrl}/health nao respondeu como BetIntel.`)
  console.error('Pare o processo nessa porta ou altere BETINTEL_BACKEND_PORT no .env.')
  process.exit(1)
} else {
  start('backend', 'node', ['backend/dist/server.js'])
}

start('frontend', npm, ['run', 'frontend:dev'])

await new Promise(() => undefined)

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnChild(command, args)
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
    child.on('error', rejectRun)
  })
}

function start(name, command, args) {
  const child = spawnChild(command, args)
  children.push(child)

  child.on('exit', (code) => {
    if (shuttingDown) return
    console.error(`${name} exited with code ${code ?? 'unknown'}`)
    shutdown(code ?? 1)
  })
}

function spawnChild(command, args) {
  const invocation = normalizeInvocation(command, args)
  const child = spawn(invocation.command, invocation.args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.pipe(process.stdout)
  child.stderr?.pipe(process.stderr)

  return child
}

function normalizeInvocation(command, args) {
  if (process.platform !== 'win32' || command !== npm) return { command, args }

  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].map(windowsQuote).join(' ')],
  }
}

function windowsQuote(value) {
  if (!/[\s"]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

async function isBackendHealthy() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    const response = await fetch(`${backendUrl}/v1/health/ready`, { signal: controller.signal })
    if (!response.ok) return false

    const payload = await response.json()
    return payload?.status === 'ok' && payload?.storage === 'postgresql'
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function isPortOpen(host, port) {
  return new Promise((resolveCheck) => {
    const socket = createConnection({ host, port })
    socket.setTimeout(1500)
    socket.once('connect', () => {
      socket.destroy()
      resolveCheck(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolveCheck(false)
    })
    socket.once('error', () => resolveCheck(false))
  })
}

function shutdown(code = 0) {
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) child.kill()
  }

  setTimeout(() => process.exit(code), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
