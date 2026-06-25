import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BetIntelModel } from './schemas.js'

export async function readModel(path: string): Promise<BetIntelModel> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<BetIntelModel>

  return {
    version: 1,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date().toISOString(),
    minRows: raw.minRows ?? 20,
    trainingRows: raw.trainingRows ?? 0,
    sourceProviders: raw.sourceProviders ?? ['local-artifact'],
    competitions: raw.competitions ?? [],
    teamProfiles: raw.teamProfiles ?? {},
    markets: raw.markets as BetIntelModel['markets'],
  }
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
