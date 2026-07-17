import type { CsvRow, FixtureRecord } from '../../schemas.js'

export interface ProviderUseConfiguration {
  provider: string
  policyReference: string
  licenseReference: string
  allowedEnvironment: string
}

export interface SportsProviderSnapshot {
  provider: string
  fetchedAt: string
  sourceTimestamp?: string
  policyReference: string
  licenseReference: string
  rows: CsvRow[]
  fixtures: FixtureRecord[]
  warnings: string[]
}

/**
 * Porta do dominio de ingestao. Adaptadores concretos traduzem cada API/CSV
 * para este contrato; persistencia e modelos nao importam SDKs de provedores.
 */
export interface SportsDataProviderAdapter {
  readonly provider: string
  fetchSnapshot(signal?: AbortSignal): Promise<SportsProviderSnapshot>
}
