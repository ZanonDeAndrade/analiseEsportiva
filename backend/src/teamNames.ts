/**
 * Normalizacao de nomes de times, compartilhada entre treino e predicao.
 *
 * O calendario da Copa 2026 usa nomes em portugues ("Brasil", "Alemanha"),
 * enquanto os dados historicos da API-Football vem em ingles ("Brazil",
 * "Germany"). Sem aliasing, os perfis nao casariam e a predicao cairia sempre
 * na base do segmento (mesma analise para todos os jogos). O mapa abaixo leva
 * os nomes em portugues para a chave canonica usada nos dados historicos.
 */

/** chave normalizada (pt) -> chave normalizada (en, como na API-Football) */
const TEAM_ALIASES: Record<string, string> = {
  suica: 'switzerland',
  bosnia: 'bosnia',
  catar: 'qatar',
  escocia: 'scotland',
  brasil: 'brazil',
  marrocos: 'morocco',
  tchequia: 'czechia',
  'africa do sul': 'south africa',
  'coreia do sul': 'south korea',
  equador: 'ecuador',
  alemanha: 'germany',
  'costa do marfim': 'ivory coast',
  japao: 'japan',
  suecia: 'sweden',
  tunisia: 'tunisia',
  holanda: 'netherlands',
  'paises baixos': 'netherlands',
  turquia: 'turkey',
  'estados unidos': 'usa',
  paraguai: 'paraguay',
  noruega: 'norway',
  franca: 'france',
  iraque: 'iraq',
  'cabo verde': 'cape verde',
  'arabia saudita': 'saudi arabia',
  uruguai: 'uruguay',
  espanha: 'spain',
  egito: 'egypt',
  ira: 'iran',
  'nova zelandia': 'new zealand',
  belgica: 'belgium',
  inglaterra: 'england',
  croacia: 'croatia',
  gana: 'ghana',
  'rd congo': 'congo dr',
  uzbequistao: 'uzbekistan',
  argelia: 'algeria',
  jordania: 'jordan',
}

export function normalizeTeamAlias(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Chave canonica de um time (com aliasing pt->en). */
export function teamKey(name: string): string {
  const normalized = normalizeTeamAlias(name)
  return TEAM_ALIASES[normalized] ?? normalized
}
