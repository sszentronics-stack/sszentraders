/**
 * Consistent success/error response envelope for every Edge Function.
 * Runtime-agnostic (returns plain objects); supabase/functions/_shared
 * wraps these into actual `Response` objects with the right status/headers.
 */
import { toAppError } from '../errors/index.ts'

export interface SuccessEnvelope<T> {
  ok: true
  data: T
}

export interface ErrorEnvelope {
  ok: false
  error: {
    code: string
    category: string
    message: string
    details?: unknown
  }
}

export function successEnvelope<T>(data: T): SuccessEnvelope<T> {
  return { ok: true, data }
}

export function errorEnvelope(err: unknown): { envelope: ErrorEnvelope; httpStatus: number } {
  const appError = toAppError(err)
  return {
    envelope: {
      ok: false,
      error: {
        code: appError.code,
        category: appError.category,
        message: appError.message,
        details: appError.details,
      },
    },
    httpStatus: appError.httpStatus,
  }
}
