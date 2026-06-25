export function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (!token.startsWith('--')) continue

    const key = token.slice(2)
    const next = argv[index + 1]

    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }

    args[key] = next
    index += 1
  }

  return args
}

export function stringArg(args: Record<string, string | boolean>, key: string): string | undefined
export function stringArg(
  args: Record<string, string | boolean>,
  key: string,
  fallback: string,
): string
export function stringArg(args: Record<string, string | boolean>, key: string, fallback?: string) {
  const value = args[key]
  return typeof value === 'string' ? value : fallback
}

export function numberArg(args: Record<string, string | boolean>, key: string, fallback: number) {
  const value = args[key]
  if (typeof value !== 'string') return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
