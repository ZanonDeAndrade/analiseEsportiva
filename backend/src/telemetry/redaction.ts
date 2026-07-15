const SENSITIVE_KEY = /(?:authorization|cookie|password|passphrase|token|secret|api[_-]?key|client[_-]?secret|dsn|email|phone|address|card|cvv|iban|payload|body|raw|useragent)/i
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const BEARER = /\bBearer\s+[^\s,;]+/gi
const URL_QUERY = /(https?:\/\/[^\s?#]+)\?[^\s#]*/gi

export function sanitizeTelemetryFields(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) return '[TRUNCATED]'
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') return sanitizeTelemetryString(value)
  if (value instanceof Error) {
    return {
      errorName: sanitizeTelemetryString(value.name),
      errorCode: safeErrorCode(value),
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeTelemetryFields(item, depth + 1))
  }
  if (typeof value !== 'object') return String(value)

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? '[REDACTED]'
      : sanitizeTelemetryFields(item, depth + 1)
  }
  return output
}

export function sanitizeTelemetryString(value: string) {
  return value
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(JWT, '[REDACTED_JWT]')
    .replace(URL_QUERY, '$1?[REDACTED]')
    .slice(0, 1_000)
}

export function safeErrorCode(error: unknown) {
  const candidate = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : error instanceof Error
      ? error.name
      : 'unknown_error'
  return candidate.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 80) || 'unknown_error'
}

