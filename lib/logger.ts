type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
  error?: Error
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const CURRENT_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL]
}

function formatLogEntry(entry: LogEntry): string {
  const { level, message, timestamp, context, error } = entry
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`

  let output = `${prefix} ${message}`

  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`
  }

  if (error) {
    output += `\n  Stack: ${error.stack}`
  }

  return output
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    error,
  }
}

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  if (!shouldLog(level)) return

  const entry = createLogEntry(level, message, context, error)
  const formatted = formatLogEntry(entry)

  switch (level) {
    case 'debug':
    case 'info':
      console.log(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    case 'error':
      console.error(formatted)
      break
  }

  // In production, you could send to external logging service here
  // e.g., Datadog, Sentry, LogRocket, etc.
}

/**
 * Enterprise-grade logger with structured logging support.
 *
 * Usage:
 * ```ts
 * logger.info('User logged in', { userId: '123' })
 * logger.error('Failed to fetch data', { endpoint: '/api/sales' }, error)
 * ```
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),

  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),

  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),

  error: (message: string, context?: Record<string, unknown>, error?: Error) =>
    log('error', message, context, error),

  /**
   * Creates a child logger with preset context.
   * Useful for adding request IDs or module names.
   */
  child: (baseContext: Record<string, unknown>) => ({
    debug: (message: string, context?: Record<string, unknown>) =>
      log('debug', message, { ...baseContext, ...context }),
    info: (message: string, context?: Record<string, unknown>) =>
      log('info', message, { ...baseContext, ...context }),
    warn: (message: string, context?: Record<string, unknown>) =>
      log('warn', message, { ...baseContext, ...context }),
    error: (message: string, context?: Record<string, unknown>, error?: Error) =>
      log('error', message, { ...baseContext, ...context }, error),
  }),
}

export default logger
