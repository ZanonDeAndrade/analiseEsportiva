import assert from 'node:assert/strict'
import test from 'node:test'
import { BASELINE_LABEL, buildBaselineReport, formatBaselineSummary } from './baselineReport.js'

function sampleCsv(rowCount = 90): string {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const competitions = ['Liga A', 'Liga B']
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta']
  const base = Date.UTC(2024, 0, 1)
  const lines = [header]
  for (let index = 0; index < rowCount; index += 1) {
    const competition = competitions[index % competitions.length]
    const date = new Date(base + index * 86_400_000).toISOString().slice(0, 10)
    const home = teams[index % teams.length]
    const away = teams[(index + 1) % teams.length]
    lines.push(`${competition},L,2024,${date},${home},${away},${index % 4},${(index + 1) % 3},test`)
  }
  return `${lines.join('\n')}\n`
}

test('buildBaselineReport produz um relatorio rotulado e reproduzivel', () => {
  const csv = sampleCsv()
  const rows = csv.trim().split('\n').slice(1).map((line) => {
    const [Competition, Div, Season, Date, HomeTeam, AwayTeam, FTHG, FTAG, SourceProvider] = line.split(',')
    return { Competition, Div, Season, Date, HomeTeam, AwayTeam, FTHG, FTAG, SourceProvider }
  })

  const options = { minRows: 3, seed: 2026, generatedAt: '2026-07-17T00:00:00.000Z', backtestMaxRows: 60 }
  const report = buildBaselineReport(csv, rows, options)

  assert.equal(report.label, BASELINE_LABEL)
  assert.equal(report.dataset.totalMatches, 90)
  assert.equal(report.dataset.validMatches, 90)
  assert.equal(report.dataset.competitions.length, 2)
  assert.ok(report.dataset.teams > 0)
  assert.ok(report.dataset.hash.length === 64)
  assert.ok(report.dataset.availableByMarket.length === 10)
  assert.ok(report.metrics.byCompetition.length === 2)
  assert.ok(report.metrics.overall && report.metrics.overall.length > 0)

  // Reprodutibilidade: mesmo conteudo e opcoes produzem o mesmo relatorio (exceto durações).
  const second = buildBaselineReport(csv, rows, options)
  assert.deepEqual(second.metrics, report.metrics)
  assert.deepEqual(second.dataset, report.dataset)
  assert.match(formatBaselineSummary(report), /Baseline anterior às correções metodológicas/)
})

test('buildBaselineReport contabiliza placares invalidos como rejeitados', () => {
  const csv =
    'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider\n' +
    'Liga A,L,2024,2024-01-01,Alfa,Beta,2,1,test\n' +
    'Liga A,L,2024,2024-01-02,Gama,Delta,999999,1,test\n'
  const rows = [
    { Competition: 'Liga A', Div: 'L', Season: '2024', Date: '2024-01-01', HomeTeam: 'Alfa', AwayTeam: 'Beta', FTHG: '2', FTAG: '1', SourceProvider: 'test' },
    { Competition: 'Liga A', Div: 'L', Season: '2024', Date: '2024-01-02', HomeTeam: 'Gama', AwayTeam: 'Delta', FTHG: '999999', FTAG: '1', SourceProvider: 'test' },
  ]
  const report = buildBaselineReport(csv, rows, { minRows: 1, generatedAt: '2026-07-17T00:00:00.000Z' })
  assert.equal(report.dataset.rejectedMatches, 1)
  assert.equal(report.dataset.rejectionsByCode.score_out_of_range, 1)
})
