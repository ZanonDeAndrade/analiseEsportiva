import { readFile } from 'node:fs/promises'
import type { CsvRow } from './schemas.js'

export function parseCsv(content: string): CsvRow[] {
  const rows = parseCsvRows(content)
  if (rows.length === 0) return []

  const [headers, ...values] = rows
  const normalizedHeaders = headers.map((header) => header.trim())

  return values
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const parsed: CsvRow = {}
      normalizedHeaders.forEach((header, index) => {
        parsed[header] = row[index]?.trim() ?? ''
      })
      return parsed
    })
}

export async function readCsvFile(path: string) {
  return parseCsv(await readFile(path, 'utf8'))
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      currentCell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
}
