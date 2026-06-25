import type { FixtureRecord } from '../schemas.js'

/**
 * Calendario OFICIAL da Copa do Mundo 2026 (datas reais publicadas).
 *
 * Fonte: cronograma divulgado da FIFA World Cup 2026 (fase de grupos finais e
 * oitavas de final), compilado de coberturas oficiais em jun/2026. Horarios
 * armazenados em UTC (`iso`); a exibicao e localizada na hora de carregar.
 *
 * Observacao academica: confrontos do mata-mata dependem da classificacao dos
 * grupos; enquanto os grupos nao terminam, aparecem como "1º Grupo X" / "2º
 * Grupo X" / "Melhor 3º", exatamente como no chaveamento oficial. Os dados sao
 * estaticos (nao atualizam placar ao vivo).
 */

export interface WorldCup2026Match {
  iso: string
  home: string
  away: string
  stage: string
  venue: string
  matchNumber?: number
}

export const WORLD_CUP_2026_SCHEDULE: WorldCup2026Match[] = [
  // ---------------- Fase de Grupos (rodada final) ----------------
  { iso: '2026-06-24T19:00:00.000Z', home: 'Suíça', away: 'Canadá', stage: 'Fase de Grupos – Grupo B', venue: 'BC Place, Vancouver' },
  { iso: '2026-06-24T19:00:00.000Z', home: 'Bósnia', away: 'Catar', stage: 'Fase de Grupos – Grupo D', venue: 'Seattle Stadium, Seattle' },
  { iso: '2026-06-24T22:00:00.000Z', home: 'Escócia', away: 'Brasil', stage: 'Fase de Grupos – Grupo C', venue: 'Miami Stadium, Miami' },
  { iso: '2026-06-24T22:00:00.000Z', home: 'Marrocos', away: 'Haiti', stage: 'Fase de Grupos – Grupo C', venue: 'Atlanta Stadium, Atlanta' },
  { iso: '2026-06-25T01:00:00.000Z', home: 'Tchéquia', away: 'México', stage: 'Fase de Grupos – Grupo A', venue: 'Estadio Azteca, Cidade do México' },
  { iso: '2026-06-25T01:00:00.000Z', home: 'África do Sul', away: 'Coreia do Sul', stage: 'Fase de Grupos – Grupo E', venue: 'Estadio Monterrey, Guadalupe' },

  { iso: '2026-06-25T20:00:00.000Z', home: 'Equador', away: 'Alemanha', stage: 'Fase de Grupos – Grupo J', venue: 'New York New Jersey Stadium, Nova Jersey' },
  { iso: '2026-06-25T20:00:00.000Z', home: 'Curaçao', away: 'Costa do Marfim', stage: 'Fase de Grupos – Grupo K', venue: 'Philadelphia Stadium, Filadélfia' },
  { iso: '2026-06-25T23:00:00.000Z', home: 'Japão', away: 'Suécia', stage: 'Fase de Grupos – Grupo F', venue: 'Dallas Stadium, Dallas' },
  { iso: '2026-06-25T23:00:00.000Z', home: 'Tunísia', away: 'Holanda', stage: 'Fase de Grupos – Grupo F', venue: 'Kansas City Stadium, Kansas City' },
  { iso: '2026-06-26T02:00:00.000Z', home: 'Turquia', away: 'Estados Unidos', stage: 'Fase de Grupos – Grupo B', venue: 'Los Angeles Stadium, Los Angeles' },
  { iso: '2026-06-26T02:00:00.000Z', home: 'Paraguai', away: 'Austrália', stage: 'Fase de Grupos – Grupo L', venue: 'San Francisco Bay Area Stadium, São Francisco' },

  { iso: '2026-06-26T19:00:00.000Z', home: 'Noruega', away: 'França', stage: 'Fase de Grupos – Grupo I', venue: 'Boston Stadium, Boston' },
  { iso: '2026-06-26T19:00:00.000Z', home: 'Senegal', away: 'Iraque', stage: 'Fase de Grupos – Grupo I', venue: 'Toronto Stadium, Toronto' },
  { iso: '2026-06-27T00:00:00.000Z', home: 'Cabo Verde', away: 'Arábia Saudita', stage: 'Fase de Grupos – Grupo H', venue: 'Houston Stadium, Houston' },
  { iso: '2026-06-27T00:00:00.000Z', home: 'Uruguai', away: 'Espanha', stage: 'Fase de Grupos – Grupo H', venue: 'Estadio Guadalajara, Zapopan' },
  { iso: '2026-06-27T03:00:00.000Z', home: 'Egito', away: 'Irã', stage: 'Fase de Grupos – Grupo G', venue: 'Seattle Stadium, Seattle' },
  { iso: '2026-06-27T03:00:00.000Z', home: 'Nova Zelândia', away: 'Bélgica', stage: 'Fase de Grupos – Grupo G', venue: 'BC Place, Vancouver' },

  { iso: '2026-06-27T21:00:00.000Z', home: 'Panamá', away: 'Inglaterra', stage: 'Fase de Grupos – Grupo D', venue: 'New York New Jersey Stadium, Nova Jersey' },
  { iso: '2026-06-27T21:00:00.000Z', home: 'Croácia', away: 'Gana', stage: 'Fase de Grupos – Grupo K', venue: 'Philadelphia Stadium, Filadélfia' },
  { iso: '2026-06-27T23:30:00.000Z', home: 'Colômbia', away: 'Portugal', stage: 'Fase de Grupos – Grupo J', venue: 'Miami Stadium, Miami' },
  { iso: '2026-06-27T23:30:00.000Z', home: 'RD Congo', away: 'Uzbequistão', stage: 'Fase de Grupos – Grupo K', venue: 'Atlanta Stadium, Atlanta' },
  { iso: '2026-06-28T02:00:00.000Z', home: 'Argélia', away: 'Áustria', stage: 'Fase de Grupos – Grupo E', venue: 'Kansas City Stadium, Kansas City' },
  { iso: '2026-06-28T02:00:00.000Z', home: 'Jordânia', away: 'Argentina', stage: 'Fase de Grupos – Grupo A', venue: 'Dallas Stadium, Dallas' },

  // ---------------- Oitavas de final (Round of 32) ----------------
  { iso: '2026-06-28T19:00:00.000Z', matchNumber: 73, home: 'África do Sul', away: 'Canadá', stage: 'Oitavas de final', venue: 'Los Angeles Stadium, Los Angeles' },
  { iso: '2026-06-29T17:00:00.000Z', matchNumber: 76, home: 'Brasil', away: '2º Grupo F', stage: 'Oitavas de final', venue: 'Houston Stadium, Houston' },
  { iso: '2026-06-29T20:30:00.000Z', matchNumber: 74, home: 'Alemanha', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'Foxborough Stadium, Boston' },
  { iso: '2026-06-30T01:00:00.000Z', matchNumber: 75, home: '1º Grupo F', away: 'Marrocos', stage: 'Oitavas de final', venue: 'Estadio Monterrey, Guadalupe' },
  { iso: '2026-06-30T17:00:00.000Z', matchNumber: 78, home: '2º Grupo E', away: '2º Grupo I', stage: 'Oitavas de final', venue: 'Dallas Stadium, Arlington' },
  { iso: '2026-06-30T21:00:00.000Z', matchNumber: 77, home: '1º Grupo I', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'New York New Jersey Stadium, Nova Jersey' },
  { iso: '2026-07-01T01:00:00.000Z', matchNumber: 79, home: 'México', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'Estadio Azteca, Cidade do México' },
  { iso: '2026-07-01T16:00:00.000Z', matchNumber: 80, home: '1º Grupo L', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'Atlanta Stadium, Atlanta' },
  { iso: '2026-07-01T20:00:00.000Z', matchNumber: 82, home: '1º Grupo G', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'Seattle Stadium, Seattle' },
  { iso: '2026-07-02T00:00:00.000Z', matchNumber: 81, home: 'Estados Unidos', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'San Francisco Bay Area Stadium, Santa Clara' },
  { iso: '2026-07-02T19:00:00.000Z', matchNumber: 84, home: '1º Grupo H', away: '2º Grupo J', stage: 'Oitavas de final', venue: 'Los Angeles Stadium, Los Angeles' },
  { iso: '2026-07-02T23:00:00.000Z', matchNumber: 83, home: '2º Grupo K', away: '2º Grupo L', stage: 'Oitavas de final', venue: 'Toronto Stadium, Toronto' },
  { iso: '2026-07-03T03:00:00.000Z', matchNumber: 85, home: 'Suíça', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'BC Place, Vancouver' },
  { iso: '2026-07-03T18:00:00.000Z', matchNumber: 88, home: '2º Grupo D', away: '2º Grupo G', stage: 'Oitavas de final', venue: 'Dallas Stadium, Arlington' },
  { iso: '2026-07-03T22:00:00.000Z', matchNumber: 86, home: 'Argentina', away: '2º Grupo H', stage: 'Oitavas de final', venue: 'Miami Stadium, Miami' },
  { iso: '2026-07-04T01:30:00.000Z', matchNumber: 87, home: '1º Grupo K', away: 'Melhor 3º', stage: 'Oitavas de final', venue: 'Kansas City Stadium, Kansas City' },
]

/**
 * Indica se o nome e um placeholder de chaveamento (ex.: "1º Grupo F",
 * "2º Grupo K", "Melhor 3º") em vez de uma selecao definida. Jogos do mata-mata
 * so tem confronto real depois que os grupos terminam; antes disso nao faz
 * sentido estimar probabilidade.
 */
export function isPlaceholderTeam(name: string): boolean {
  return /grupo|melhor\s*3|vencedor|perdedor/i.test(name)
}

/** Confronto totalmente definido (ambos os times sao selecoes reais). */
export function isDefinedMatchup(homeTeam: string, awayTeam: string): boolean {
  return !isPlaceholderTeam(homeTeam) && !isPlaceholderTeam(awayTeam)
}

/** Converte o calendario oficial em FixtureRecord[] com datas reais. */
export function worldCup2026Fixtures(now = new Date()): FixtureRecord[] {
  const updatedAt = now.toISOString()

  return WORLD_CUP_2026_SCHEDULE.map((match) => {
    const kickoff = new Date(match.iso)

    return {
      id: match.matchNumber ? `wc2026-${match.matchNumber}` : `wc2026-${slug(match.home)}-${slug(match.away)}`,
      fixtureId: match.matchNumber,
      competition: 'World Cup 2026',
      leagueId: 'WC2026',
      league: 'World Cup',
      season: '2026',
      round: match.stage,
      date: kickoff.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      time: kickoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isoDate: match.iso,
      status: 'NS',
      homeTeam: match.home,
      awayTeam: match.away,
      sourceProvider: 'calendario-oficial',
      updatedAt,
      isFallback: false,
    }
  })
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
