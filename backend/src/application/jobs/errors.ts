export class JobCancelledError extends Error {
  readonly code = 'job_cancelled'
  constructor() {
    super('Job cancelado por solicitacao valida.')
    this.name = 'JobCancelledError'
  }
}

export class JobTimeoutError extends Error {
  readonly code = 'job_timeout'
  constructor() {
    super('Job excedeu o timeout configurado.')
    this.name = 'JobTimeoutError'
  }
}

export class QuotaExceededError extends Error {
  readonly code = 'provider_quota_exceeded'
  readonly unrecoverable = true
  constructor(readonly provider: string) {
    super(`Cota do provider ${provider} esgotada.`)
    this.name = 'QuotaExceededError'
  }
}

export class CircuitOpenError extends Error {
  readonly code = 'provider_circuit_open'
  constructor(readonly provider: string) {
    super(`Circuit breaker aberto para ${provider}.`)
    this.name = 'CircuitOpenError'
  }
}

export class ProcessorUnavailableError extends Error {
  readonly code = 'processor_unavailable'
  readonly unrecoverable = true
  constructor() {
    super('Processador nao configurado para este tipo de job.')
    this.name = 'ProcessorUnavailableError'
  }
}
