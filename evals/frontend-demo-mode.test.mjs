import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('dados de screenshot exigem modo demo explícito e não substituem a API', async () => {
  const [app, data, main] = await Promise.all([
    readFile(path.join(root, 'frontend', 'src', 'App.tsx'), 'utf8'),
    readFile(path.join(root, 'frontend', 'src', 'data', 'matches.ts'), 'utf8'),
    readFile(path.join(root, 'frontend', 'src', 'main.tsx'), 'utf8'),
  ])

  assert.match(app, /get\('demo'\) === '1'/)
  assert.match(app, /SCREENSHOT_DEMO_MODE \? screenshotMatches : \[\]/)
  assert.match(app, /loadBackendMatches\(getAccessTokenSilently, false\)/)
  assert.match(main, /screenshotDemoMode \? \(/)
  assert.match(data, /const SCREENSHOT_MATCH_IDS = new Set\(\['m1', 'm4', 'm6', 'm10'\]\)/)
  assert.match(data, /Não participa do carregamento normal e nunca funciona como fallback da API/)
  assert.match(data, /Dados simulados para demonstração visual/)
})

test('falha de predição não injeta probabilidades ou estatísticas inventadas', async () => {
  const [api, analysis] = await Promise.all([
    readFile(path.join(root, 'frontend', 'src', 'lib', 'api.ts'), 'utf8'),
    readFile(path.join(root, 'frontend', 'src', 'lib', 'analysis.ts'), 'utf8'),
  ])

  assert.match(api, /if \(!prediction\) return \{\}/)
  assert.doesNotMatch(api, /homeWin:\s*38/)
  assert.doesNotMatch(api, /function estimateAverage/)
  assert.doesNotMatch(api, /function formFor/)
  assert.match(analysis, /value === undefined \? 'n\/d'/)
})
