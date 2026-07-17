/** Normalizacao generica de nomes de times, compartilhada entre treino e predicao. */

export function normalizeTeamAlias(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Chave canonica local de um time. Aliases revisados sao resolvidos na ingestao. */
export function teamKey(name: string): string {
  return normalizeTeamAlias(name)
}
