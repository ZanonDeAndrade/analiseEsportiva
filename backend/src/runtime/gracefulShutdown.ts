export interface GracefulShutdownOptions {
  processName: string
  timeoutMs: number
  close: () => Promise<void>
  logger?: Pick<Console, 'info' | 'error'>
  forceExit?: (code: number) => void
}

export interface GracefulShutdownController {
  shutdown(signal: NodeJS.Signals | 'manual'): Promise<void>
}

export function createGracefulShutdownController(
  options: GracefulShutdownOptions,
): GracefulShutdownController {
  let current: Promise<void> | undefined
  const logger = options.logger ?? console

  return {
    shutdown(signal) {
      if (current) return current
      current = run(signal)
      return current
    },
  }

  async function run(signal: NodeJS.Signals | 'manual') {
    logger.info(JSON.stringify({ event: 'shutdown_started', process: options.processName, signal }))
    const timer = setTimeout(() => {
      logger.error(JSON.stringify({ event: 'shutdown_timeout', process: options.processName }))
      ;(options.forceExit ?? process.exit)(1)
    }, options.timeoutMs)

    try {
      await options.close()
      logger.info(JSON.stringify({ event: 'shutdown_completed', process: options.processName }))
    } catch {
      process.exitCode = 1
      logger.error(JSON.stringify({ event: 'shutdown_failed', process: options.processName }))
    } finally {
      clearTimeout(timer)
    }
  }
}

export function installGracefulShutdown(options: GracefulShutdownOptions) {
  const controller = createGracefulShutdownController(options)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void controller.shutdown(signal))
  }
  return controller
}
