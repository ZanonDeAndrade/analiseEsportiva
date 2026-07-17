import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const cliDir = fileURLToPath(new URL('.', import.meta.url))
const trainCli = join(cliDir, 'train.js')
const evaluateCli = join(cliDir, 'evaluate.js')
const backtestCli = join(cliDir, 'backtest.js')

/** Gera um CSV com datas distintas e placar variado para exercitar o pipeline. */
function sampleCsv(rowCount = 60): string {
  const header = 'Div,League,Competition,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HC,AC,HY,AY,HR,AR'
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta']
  const base = Date.UTC(2024, 0, 1)
  const lines = [header]
  for (let index = 0; index < rowCount; index += 1) {
    const date = new Date(base + index * 86_400_000).toISOString().slice(0, 10)
    const home = teams[index % teams.length]
    const away = teams[(index + 1) % teams.length]
    const homeGoals = index % 4
    const awayGoals = (index + 1) % 3
    lines.push(`L,Liga,Comp,2024,${date},${home},${away},${homeGoals},${awayGoals},,5,4,2,1,0,0`)
  }
  return `${lines.join('\n')}\n`
}

/** Executa o CLI compilado com um ambiente sem DATABASE_URL (garante modo offline). */
function runCli(cliPath: string, args: string[]) {
  const env = { ...process.env }
  delete env.DATABASE_URL
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', env })
}

function withTempCsv(prefix: string, run: (csvPath: string, outputPath: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    const csvPath = join(dir, 'sample.csv')
    const outputPath = join(dir, 'result.json')
    writeFileSync(csvPath, sampleCsv())
    run(csvPath, outputPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('backend:train roda em modo offline com --csv e sem DATABASE_URL', () => {
  withTempCsv('betintel-train-', (csvPath, outputPath) => {
    const result = runCli(trainCli, ['--csv', csvPath, '--min-rows', '5', '--output', outputPath])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /offline/i)
    assert.ok(existsSync(outputPath), 'o arquivo de saida deve existir')
    const model: { markets: Record<string, unknown>; trainingRows: number } = JSON.parse(
      readFileSync(outputPath, 'utf8'),
    )
    assert.ok(model.trainingRows > 0)
    assert.ok(Object.keys(model.markets).length > 0)
  })
})

test('backend:evaluate roda em modo offline com --csv e sem DATABASE_URL', () => {
  withTempCsv('betintel-eval-', (csvPath, outputPath) => {
    const result = runCli(evaluateCli, ['--csv', csvPath, '--min-rows', '5', '--output', outputPath])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /offline/i)
    const report: { metrics: unknown[]; testRows: number } = JSON.parse(readFileSync(outputPath, 'utf8'))
    assert.ok(Array.isArray(report.metrics))
    assert.ok(report.testRows > 0)
  })
})

test('backend:backtest roda em modo offline com --csv e sem DATABASE_URL', () => {
  withTempCsv('betintel-backtest-', (csvPath, outputPath) => {
    const result = runCli(backtestCli, [
      '--csv', csvPath, '--min-rows', '5', '--initial-window', '10', '--output', outputPath,
    ])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /offline/i)
    const report: { metrics: unknown[]; evaluatedRows: number } = JSON.parse(readFileSync(outputPath, 'utf8'))
    assert.ok(Array.isArray(report.metrics))
    assert.ok(report.evaluatedRows > 0)
  })
})

test('modo PostgreSQL sem DATABASE_URL falha com mensagem amigavel e sem stack trace', () => {
  const result = runCli(trainCli, [])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DATABASE_URL/)
  assert.match(result.stderr, /--csv/)
  assert.doesNotMatch(result.stderr, /\n\s+at\s+/, 'stderr nao deve conter stack trace')
  assert.doesNotMatch(result.stderr, /node:internal/, 'stderr nao deve conter frames internos')
})
