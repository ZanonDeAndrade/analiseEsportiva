import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readCsvFile } from './csv.js'
import { dataDir, fixtureWindowDays } from './config.js'
import { isDefinedMatchup, worldCup2026Fixtures } from './providers/worldCup2026.js'
import type { CompetitionSummary, CsvRow, FixtureRecord } from './schemas.js'

const SAMPLE_CSV = resolve('backend/src/fixtures/sample-results.csv')

export function combinedCsvPath() {
  return join(dataDir(), 'combined-results.csv')
}

export function fixturesPath() {
  return join(dataDir(), 'fixtures.json')
}

export function syncMetadataPath() {
  return join(dataDir(), 'sync-metadata.json')
}

export async function readTrainingRows(csvPath?: string): Promise<CsvRow[]> {
  if (csvPath) return readCsvFile(resolve(csvPath))

  const combined = combinedCsvPath()
  if (existsSync(combined)) return readCsvFile(combined)

  const csvFiles = existsSync(dataDir())
    ? (await readdir(dataDir())).filter((name) => name.endsWith('.csv')).map((name) => join(dataDir(), name))
    : []

  if (csvFiles.length > 0) {
    const rows = await Promise.all(csvFiles.map((path) => readCsvFile(path)))
    return rows.flat()
  }

  return readCsvFile(SAMPLE_CSV)
}

export async function writeCsvRows(path: string, rows: CsvRow[]) {
  await mkdir(dirname(path), { recursive: true })
  const columns = Array.from(
    new Set([
      'Div',
      'League',
      'Competition',
      'Season',
      'Date',
      'HomeTeam',
      'AwayTeam',
      'FTHG',
      'FTAG',
      'FTR',
      'HC',
      'AC',
      'HY',
      'AY',
      'HR',
      'AR',
      'SourceProvider',
      'SourceUrl',
      'UpdatedAt',
      ...rows.flatMap((row) => Object.keys(row)),
    ]),
  )
  const body = [columns.join(',')]

  for (const row of rows) {
    body.push(columns.map((column) => csvCell(row[column] ?? '')).join(','))
  }

  await writeFile(path, `${body.join('\n')}\n`, 'utf8')
}

export async function readFixturesCache(): Promise<FixtureRecord[]> {
  const path = fixturesPath()
  if (!existsSync(path)) return defaultSchedule()
  return JSON.parse(await readFile(path, 'utf8')) as FixtureRecord[]
}

export function upcomingFixtures(fixtures: FixtureRecord[], now = new Date()): FixtureRecord[] {
  return fixtures
    .filter((fixture) => isUpcomingFixture(fixture, now))
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate))
}

export function isUpcomingFixture(fixture: FixtureRecord, now = new Date()): boolean {
  const kickoff = new Date(fixture.isoDate)
  if (Number.isNaN(kickoff.getTime())) return false

  return kickoff.getTime() > now.getTime()
}

export async function writeFixturesCache(fixtures: FixtureRecord[]) {
  await mkdir(dirname(fixturesPath()), { recursive: true })
  await writeFile(fixturesPath(), `${JSON.stringify(fixtures, null, 2)}\n`, 'utf8')
}

export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export function buildCompetitions(fixtures: FixtureRecord[]): CompetitionSummary[] {
  const groups = new Map<string, CompetitionSummary>()

  for (const fixture of fixtures) {
    const current = groups.get(fixture.competition) ?? {
      id: fixture.leagueId,
      name: fixture.competition,
      provider: fixture.sourceProvider,
      season: fixture.season,
      fixtures: 0,
      updatedAt: fixture.updatedAt,
    }

    current.fixtures += 1
    current.updatedAt = maxString(current.updatedAt, fixture.updatedAt)
    groups.set(fixture.competition, current)
  }

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name))
}

interface FallbackCompetition {
  leagueId: string
  competition: string
  league: string
  round: string
  season: string
  teams: string[]
}

/**
 * Elencos simulados (fins academicos). Usados apenas quando a API_FOOTBALL_KEY
 * nao esta configurada, para popular uma rodada completa por liga.
 */
const FALLBACK_COMPETITIONS: FallbackCompetition[] = [
  {
    leagueId: 'BRA',
    competition: 'Brasileirao Serie A',
    league: 'Brasileirão Série A',
    round: 'Rodada',
    season: '2026',
    teams: ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Grêmio', 'Atlético-MG', 'Internacional', 'Botafogo', 'Fluminense', 'Cruzeiro'],
  },
  {
    leagueId: 'PL',
    competition: 'Premier League',
    league: 'Premier League',
    round: 'Matchweek',
    season: '2026',
    teams: ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'],
  },
  {
    leagueId: 'LL',
    competition: 'La Liga',
    league: 'La Liga',
    round: 'Jornada',
    season: '2026',
    teams: ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal', 'Real Betis', 'Valencia', 'Girona', 'Athletic Bilbao'],
  },
  {
    leagueId: 'L1',
    competition: 'Ligue 1',
    league: 'Ligue 1',
    round: 'Journée',
    season: '2026',
    teams: ['PSG', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice', 'Rennes', 'Lens', 'Nantes', 'Reims'],
  },
  {
    leagueId: 'BUN',
    competition: 'Bundesliga',
    league: 'Bundesliga',
    round: 'Spieltag',
    season: '2026',
    teams: ['Bayern Munich', 'Borussia Dortmund', 'Leverkusen', 'RB Leipzig', 'Stuttgart', 'Eintracht Frankfurt', 'Wolfsburg', 'Freiburg', 'Union Berlin', 'Hoffenheim'],
  },
]

/** Horarios de pontape (UTC) usados ciclicamente para espalhar os jogos no dia. */
const FALLBACK_KICKOFF_HOURS = [16, 19, 21, 14, 18, 20, 17]

/**
 * Gera uma agenda simulada rolante: uma rodada completa por competicao,
 * distribuida nos proximos `BETINTEL_FIXTURE_DAYS` dias (padrao 7). Como e
 * calculada a partir de `now`, a agenda avanca sozinha a cada dia.
 */
export function fallbackFixtures(now = new Date()): FixtureRecord[] {
  const updatedAt = now.toISOString()
  const days = fixtureWindowDays()
  const fixtures: FixtureRecord[] = []

  FALLBACK_COMPETITIONS.forEach((comp, compIndex) => {
    roundPairs(comp.teams).forEach((pair, index) => {
      const dayOffset = index % days
      const utcHour = FALLBACK_KICKOFF_HOURS[(index + compIndex) % FALLBACK_KICKOFF_HOURS.length]
      const kickoff = fallbackKickoff(now, dayOffset, utcHour)

      fixtures.push({
        id: `fallback-${comp.leagueId}-${slug(pair[0])}-${slug(pair[1])}`,
        competition: comp.competition,
        leagueId: comp.leagueId,
        league: comp.league,
        season: comp.season,
        round: comp.round,
        date: formatFixtureDate(kickoff),
        time: kickoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        isoDate: kickoff.toISOString(),
        status: 'NS',
        homeTeam: pair[0],
        awayTeam: pair[1],
        sourceProvider: 'mock-fallback',
        updatedAt,
        isFallback: true,
      })
    })
  })

  return fixtures.sort((left, right) => left.isoDate.localeCompare(right.isoDate))
}

/**
 * Agenda padrao quando a API-Football nao esta disponivel (sem chave ou plano
 * sem acesso a 2026). Prioriza dados REAIS:
 *
 * - Se a Copa do Mundo 2026 tem jogos futuros, usa o calendario OFICIAL real.
 *   Opcionalmente adiciona as ligas simuladas se BETINTEL_SIMULATE_LEAGUES=true.
 * - Se nao ha jogos futuros da Copa (torneio encerrado/nao iniciado), cai para
 *   a agenda simulada das ligas para nao deixar a tela vazia.
 */
export function defaultSchedule(now = new Date()): FixtureRecord[] {
  // So inclui jogos com confronto definido: nao faz sentido estimar
  // probabilidade de "1º Grupo F x Melhor 3º" antes dos grupos terminarem.
  const worldCup = worldCup2026Fixtures(now).filter((fixture) =>
    isDefinedMatchup(fixture.homeTeam, fixture.awayTeam),
  )
  const hasUpcomingWorldCup = worldCup.some((fixture) => isUpcomingFixture(fixture, now))
  const simulateLeagues = process.env.BETINTEL_SIMULATE_LEAGUES === 'true'

  if (hasUpcomingWorldCup) {
    const extra = simulateLeagues ? fallbackFixtures(now) : []
    return [...worldCup, ...extra].sort((left, right) => left.isoDate.localeCompare(right.isoDate))
  }

  return fallbackFixtures(now)
}

/** Empareia os times de uma lista em uma rodada (1 jogo por time). */
function roundPairs(teams: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let index = 0; index < Math.floor(teams.length / 2); index += 1) {
    pairs.push([teams[index], teams[teams.length - 1 - index]])
  }
  return pairs
}

function fallbackKickoff(now: Date, daysFromNow: number, utcHour: number) {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  date.setUTCHours(utcHour, 0, 0, 0)
  return date
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatFixtureDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function csvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

function maxString(left: string | undefined, right: string | undefined) {
  if (!left) return right
  if (!right) return left
  return left > right ? left : right
}
