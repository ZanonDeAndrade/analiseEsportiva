import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { backendPort, fixtureWindow, modelPath } from './config.js'
import {
  buildCompetitions,
  defaultSchedule,
  readFixturesCache,
  readJsonIfExists,
  readTrainingRows,
  syncMetadataPath,
  upcomingFixtures,
  writeFixturesCache,
} from './dataStore.js'
import { evaluateModel } from './evaluation.js'
import { buildFeatureTable } from './featureEngineering.js'
import { readModel, writeJson } from './io.js'
import { marketDefinitions } from './markets.js'
import { predictMarkets } from './prediction.js'
import { runBacktest } from './backtesting.js'
import { artifactPath } from './config.js'
import { syncData } from './syncData.js'
import { trainModel } from './training.js'
import { fetchApiFootballTargetFixtures } from './providers/apiFootballProvider.js'
import type { BetIntelModel, FixtureRecord, PredictionRequest } from './schemas.js'

const port = backendPort()
const configuredModelPath = modelPath()
const fixtureRefreshMs = Number(process.env.BETINTEL_FIXTURE_REFRESH_MS ?? 5 * 60 * 1000)
// Cada quanto re-testar a API quando o plano bloqueou a temporada (detecta upgrade).
const apiRecheckMs = Number(process.env.BETINTEL_API_RECHECK_MS ?? 24 * 60 * 60 * 1000)

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'content-type')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, {
        status: 'ok',
        modelPath: configuredModelPath,
        modelLoaded: existsSync(configuredModelPath),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/markets') {
      json(response, 200, { markets: Object.values(marketDefinitions) })
      return
    }

    if (request.method === 'GET' && url.pathname === '/competitions') {
      const fixtures = upcomingFixtures(await readFixturesCache())
      json(response, 200, { competitions: buildCompetitions(fixtures) })
      return
    }

    if (request.method === 'GET' && url.pathname === '/fixtures') {
      const fixtures = await filteredFixtures(url)
      json(response, 200, {
        fixtures,
        sourceProvider: fixtures[0]?.sourceProvider ?? 'local-cache',
        updatedAt: fixtures[0]?.updatedAt ?? new Date().toISOString(),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/sync-data') {
      const body = await readBody<{ includeFootballData?: boolean }>(request)
      json(response, 200, await syncData({ includeFootballData: body.includeFootballData }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/train') {
      const body = await readBody<{ minRows?: number }>(request)
      json(response, 200, await trainAndPersist(body.minRows))
      return
    }

    if (request.method === 'GET' && url.pathname === '/evaluation') {
      const report = (await readJsonIfExists(artifactPath('evaluation.json'))) ?? (await evaluateAndPersist())
      json(response, 200, report)
      return
    }

    if (request.method === 'GET' && url.pathname === '/backtest') {
      const report = (await readJsonIfExists(artifactPath('backtest.json'))) ?? (await backtestAndPersist())
      json(response, 200, report)
      return
    }

    if (request.method === 'POST' && url.pathname === '/predict') {
      const body = await readBody<PredictionRequest>(request)
      const requestBody = await enrichPredictionRequest(body)
      const model = await loadOrTrainModel()
      json(response, 200, predictMarkets(model, requestBody))
      return
    }

    json(response, 404, { error: 'not_found' })
  } catch (error) {
    json(response, 500, {
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
})

server.listen(port, () => {
  console.log(`BetIntel backend em http://127.0.0.1:${port}`)
})

async function loadOrTrainModel(): Promise<BetIntelModel> {
  if (existsSync(configuredModelPath)) return readModel(configuredModelPath)
  return (await trainAndPersist()).model
}

async function trainAndPersist(minRows = 5) {
  const featureTable = buildFeatureTable(await readTrainingRows())
  const model = trainModel(featureTable.records, { minRows })

  await writeJson(configuredModelPath, {
    ...model,
    featureEngineering: {
      detectedColumns: featureTable.detectedColumns,
      acceptedRows: featureTable.records.length,
      rejectedRows: featureTable.rejectedRows,
    },
  })

  return {
    model,
    modelPath: configuredModelPath,
    acceptedRows: featureTable.records.length,
    rejectedRows: featureTable.rejectedRows.length,
  }
}

async function evaluateAndPersist() {
  const featureTable = buildFeatureTable(await readTrainingRows())
  const report = evaluateModel(featureTable.records, { minRows: 5, testRatio: 0.2 })
  await writeJson(artifactPath('evaluation.json'), report)
  return report
}

async function backtestAndPersist() {
  const featureTable = buildFeatureTable(await readTrainingRows())
  const report = runBacktest(featureTable.records, { minRows: 5, initialWindow: 5 })
  await writeJson(artifactPath('backtest.json'), report)
  return report
}

async function filteredFixtures(url: URL): Promise<FixtureRecord[]> {
  await maybeRefreshFixtures(url.searchParams.get('refresh') === 'true')

  // Janela rolante padrao (hoje ate hoje + BETINTEL_FIXTURE_DAYS); query params
  // sobrescrevem quando presentes.
  const window = fixtureWindow()
  const competition = url.searchParams.get('competition')
  const from = url.searchParams.get('from') ?? window.from
  const to = url.searchParams.get('to') ?? window.to
  const includePast = url.searchParams.get('includePast') === 'true'
  const fixtures = includePast ? await readFixturesCache() : upcomingFixtures(await readFixturesCache())

  return fixtures.filter((fixture) => {
    if (competition && fixture.competition !== competition && fixture.leagueId !== competition) return false
    if (from && fixture.isoDate.slice(0, 10) < from) return false
    if (to && fixture.isoDate.slice(0, 10) > to) return false
    return true
  })
}

async function maybeRefreshFixtures(force: boolean) {
  const metadata = await readJsonIfExists<{
    generatedAt?: string
    fixturesUpdatedAt?: string
    sourceProvider?: string
    apiSeasonBlocked?: boolean
    apiCheckedAt?: string
  }>(syncMetadataPath())
  const lastUpdatedAt = metadata?.fixturesUpdatedAt ?? metadata?.generatedAt
  const lastUpdatedMs = lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : 0
  const isFresh = Number.isFinite(lastUpdatedMs) && Date.now() - lastUpdatedMs < fixtureRefreshMs

  if (!force && isFresh) return

  const apiKey = process.env.API_FOOTBALL_KEY

  // Evita repetir chamadas caras (lentas e que gastam cota) quando ja sabemos
  // que o plano nao serve a temporada atual. Recheca de tempos em tempos para
  // detectar upgrade de plano. `npm run backend:sync` sempre forca a API.
  const checkedMs = metadata?.apiCheckedAt ? new Date(metadata.apiCheckedAt).getTime() : 0
  const recheckDue = !Number.isFinite(checkedMs) || Date.now() - checkedMs > apiRecheckMs
  const shouldTryApi = Boolean(apiKey) && (!metadata?.apiSeasonBlocked || recheckDue)

  if (apiKey && shouldTryApi) {
    try {
      const { from, to } = fixtureWindow()
      const result = await fetchApiFootballTargetFixtures({ apiKey, from, to })

      // So usa a resposta real se houver jogos; caso contrario cai para o simulado
      // (evita tela vazia quando as ligas estao fora de temporada na janela).
      if (result.fixtures.length > 0) {
        await writeFixturesCache(result.fixtures)
        await writeJson(syncMetadataPath(), {
          ...metadata,
          generatedAt: new Date().toISOString(),
          fixturesUpdatedAt: result.updatedAt,
          sourceProvider: 'api-football',
          fixtures: result.fixtures.length,
          simulated: false,
          apiSeasonBlocked: false,
          apiCheckedAt: new Date().toISOString(),
        })
        return
      }
    } catch {
      // Falha na API: cai para a agenda simulada abaixo para nao deixar a tela vazia.
    }
  }

  // Sem chave (ou API indisponivel): usa o calendario oficial real da Copa 2026
  // (e ligas simuladas como complemento opcional / fora do torneio).
  const fixtures = defaultSchedule()
  const simulated = fixtures.some((fixture) => fixture.isFallback)
  await writeFixturesCache(fixtures)
  await writeJson(syncMetadataPath(), {
    ...metadata,
    generatedAt: new Date().toISOString(),
    fixturesUpdatedAt: new Date().toISOString(),
    sourceProvider: simulated ? 'calendario-oficial, mock-fallback' : 'calendario-oficial',
    fixtures: fixtures.length,
    simulated,
    // Marca bloqueio so quando tentou a API agora e nao veio nada.
    apiSeasonBlocked: apiKey ? shouldTryApi || metadata?.apiSeasonBlocked === true : metadata?.apiSeasonBlocked,
    apiCheckedAt: apiKey && shouldTryApi ? new Date().toISOString() : metadata?.apiCheckedAt,
  })
}

async function enrichPredictionRequest(body: PredictionRequest): Promise<PredictionRequest> {
  if (body.homeTeam && body.awayTeam) return body

  const fixtures = await readFixturesCache()
  const fixture = fixtures.find((item) => String(item.fixtureId ?? item.id) === String(body.fixtureId))

  if (!fixture) return body

  return {
    ...body,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    competition: fixture.competition,
    league: fixture.league,
    season: fixture.season,
    date: fixture.isoDate,
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value, null, 2))
}

async function readBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as T) : ({} as T)
}
