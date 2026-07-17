import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseSourceDate } from '../import/dateParser.js'
import type { EngineeredMatchRecord } from '../schemas.js'

/**
 * Erro de configuracao esperado (ex.: DATABASE_URL ausente no modo PostgreSQL).
 * O runner do CLI exibe apenas a mensagem, sem stack trace.
 */
export class CliConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliConfigError'
  }
}

/**
 * Exige DATABASE_URL somente quando o comando realmente precisa de persistencia.
 * No modo academico/offline (com --csv) esta verificacao nunca e chamada, logo
 * o pipeline roda sem PostgreSQL, Redis ou Auth0.
 */
export function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new CliConfigError(
      'DATABASE_URL nao esta configurada. Para o modo academico/offline use --csv <arquivo> ' +
        '(treino, avaliacao e backtest sem PostgreSQL). Para persistir os resultados, defina DATABASE_URL.',
    )
  }
}

/**
 * Normaliza as datas dos registros para ISO 8601 (aceita ISO e DD/MM/AAAA).
 * Necessario no modo offline porque um CSV pode misturar formatos de fontes
 * diferentes (a divisao temporal e o backtest exigem datas comparaveis). Datas
 * que nao casam com os formatos suportados sao mantidas sem alteracao.
 */
export function normalizeRecordDates(records: EngineeredMatchRecord[]): EngineeredMatchRecord[] {
  return records.map((record) => {
    if (!record.date) return record
    try {
      return { ...record, date: parseSourceDate(record.date) }
    } catch {
      return record
    }
  })
}

/** Salva o resultado como JSON somente quando --output <arquivo> e informado. */
export async function writeResult(outputPath: string | undefined, payload: unknown): Promise<void> {
  if (!outputPath) return
  const target = resolve(outputPath)
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Resultado salvo em ${target}`)
}

/**
 * Executa o corpo do CLI e trata erros esperados sem vazar stack trace.
 * Qualquer falha resulta em exit code 1 com uma mensagem limpa no stderr.
 */
export function runCli(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
