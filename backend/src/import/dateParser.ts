const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const BRAZILIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

/**
 * Converte somente formatos não ambíguos aceitos pelo importador.
 * Datas sem hora são ancoradas em 00:00:00 UTC.
 */
export function parseSourceDate(value: string): string {
  const input = value.trim()
  const isoDate = ISO_DATE.exec(input)

  if (isoDate) {
    return checkedUtcDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), input)
  }

  const brazilian = BRAZILIAN_DATE.exec(input)
  if (brazilian) {
    return checkedUtcDate(
      Number(brazilian[3]),
      Number(brazilian[2]),
      Number(brazilian[1]),
      input,
    )
  }

  if (ISO_INSTANT.test(input)) {
    const parsed = new Date(input)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  throw new Error(
    `Data invalida "${input}". Formatos aceitos: ISO 8601 ou DD/MM/AAAA.`,
  )
}

function checkedUtcDate(year: number, month: number, day: number, source: string) {
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Data invalida "${source}".`)
  }

  return parsed.toISOString()
}
