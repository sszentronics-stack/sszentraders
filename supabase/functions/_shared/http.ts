/**
 * Turns the runtime-agnostic envelope helpers in backend/lib/response and
 * backend/lib/errors into actual Fetch API `Response` objects for Deno's
 * Edge Function runtime. Deno supports importing relative .ts files
 * directly with no build step, so this re-uses the SAME authoritative
 * implementation the Vitest suite exercises under backend/lib — no forked
 * copy of the error/response shapes lives here.
 */
import { errorEnvelope, successEnvelope } from '../../../backend/lib/response/index.ts'
import { logger } from '../../../backend/lib/logger/index.ts'
import { toAppError } from '../../../backend/lib/errors/index.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

export function jsonResponse(body: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  })
}

export function okResponse<T>(data: T, status = 200): Response {
  return jsonResponse(successEnvelope(data), status)
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  return null
}

/**
 * Wraps an Edge Function handler with consistent error handling: any thrown
 * AppError (or IntegrationNotConfiguredError) is converted to the standard
 * error envelope with the right HTTP status; anything else is logged
 * server-side (never with secrets — see backend/lib/logger) and returned as
 * a generic 500 that leaks no stack trace or internal detail.
 */
export function withErrorHandling(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const preflight = handleCorsPreflight(req)
    if (preflight) return preflight

    try {
      return await handler(req)
    } catch (err) {
      const appError = toAppError(err)
      if (appError.category === 'server') {
        logger.error('Unhandled error in Edge Function', {
          message: err instanceof Error ? err.message : String(err),
          url: req.url,
        })
      }
      const { envelope, httpStatus } = errorEnvelope(err)
      return jsonResponse(envelope, httpStatus)
    }
  }
}
