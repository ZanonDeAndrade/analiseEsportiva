export const userLocale = typeof navigator === 'undefined' ? 'pt-BR' : navigator.languages?.[0] ?? navigator.language ?? 'pt-BR'
export const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function formatDateTime(value: string | undefined, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return 'n/d'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/d'
  return new Intl.DateTimeFormat(userLocale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: userTimeZone, ...options,
  }).format(date)
}

export function formatDate(value: string | undefined) {
  if (!value) return 'n/d'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/d'
  return new Intl.DateTimeFormat(userLocale, { dateStyle: 'medium', timeZone: userTimeZone }).format(date)
}

export function formatMoney(valueMinor: number, currency: string) {
  return new Intl.NumberFormat(userLocale, { style: 'currency', currency }).format(valueMinor / 100)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(userLocale).format(value)
}
