/**
 * Minimal structured logger for Edge Functions. Emits single-line JSON so
 * Supabase's log drains stay grep/parse-friendly. Redacts known secret-like
 * keys defensively so an accidental `log(..., config)` call cannot leak a
 * service-role key, API secret, or token into logs.
 */

const REDACTED = '[REDACTED]'

const SECRET_KEY_PATTERN =
  /(key|secret|token|password|authorization|service_role|hash)/i

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[circular]'
    seen.add(value as object)
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(val, seen)
    }
    return out
  }
  return String(value)
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  [key: string]: unknown
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const line = JSON.stringify({
    level,
    message,
    ...((fields ? (redact(fields) as Record<string, unknown>) : {})),
    timestamp: new Date().toISOString(),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
}

/** Exposed for tests: redact() is otherwise a private implementation detail. */
export const __internal = { redact }
