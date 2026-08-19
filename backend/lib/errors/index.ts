/**
 * Centralized error taxonomy for every Edge Function. Each AppError subclass
 * carries an HTTP status and a stable machine-readable `code`, so
 * supabase/functions/_shared/response.ts can turn any thrown error into a
 * consistent envelope without leaking stack traces or secrets to the client.
 */

export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'integration'
  | 'server'

export class AppError extends Error {
  readonly category: ErrorCategory
  readonly httpStatus: number
  readonly code: string
  readonly details?: unknown

  constructor(params: { category: ErrorCategory; httpStatus: number; code: string; message: string; details?: unknown }) {
    super(params.message)
    this.name = 'AppError'
    this.category = params.category
    this.httpStatus = params.httpStatus
    this.code = params.code
    this.details = params.details
  }
}

export interface ValidationIssue {
  path: string
  message: string
}

export class ValidationError extends AppError {
  constructor(message: string, issues: ValidationIssue[] = []) {
    super({ category: 'validation', httpStatus: 400, code: 'validation_failed', message, details: { issues } })
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({ category: 'auth', httpStatus: 401, code: 'authentication_required', message })
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({ category: 'authorization', httpStatus: 403, code: 'forbidden', message })
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, message = `${entity} was not found.`) {
    super({ category: 'not_found', httpStatus: 404, code: 'not_found', message })
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({ category: 'conflict', httpStatus: 409, code: 'conflict', message })
    this.name = 'ConflictError'
  }
}

export class IntegrationError extends AppError {
  constructor(provider: string, message: string) {
    super({ category: 'integration', httpStatus: 502, code: 'integration_error', message: `${provider}: ${message}` })
    this.name = 'IntegrationError'
  }
}

/** Used by Edge Function skeletons for functionality intentionally deferred to a later phase (never for a genuinely broken feature). */
export class NotImplementedYetError extends AppError {
  constructor(feature: string, phase: string) {
    super({
      category: 'server',
      httpStatus: 501,
      code: 'not_implemented_yet',
      message: `${feature} is not implemented in Phase 1. Planned for ${phase}.`,
    })
    this.name = 'NotImplementedYetError'
  }
}

export class ServerError extends AppError {
  constructor(message = 'An unexpected error occurred.') {
    super({ category: 'server', httpStatus: 500, code: 'internal_error', message })
    this.name = 'ServerError'
  }
}

/** Normalize any thrown value (AppError, IntegrationNotConfiguredError, or unknown) into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error && err.name === 'IntegrationNotConfiguredError') {
    return new AppError({
      category: 'integration',
      httpStatus: 501,
      code: 'integration_not_configured',
      message: err.message,
    })
  }
  // Never leak the raw error message/stack of an unrecognized error to the
  // client — log it server-side (see backend/lib/logger) and return a
  // generic message instead.
  return new ServerError()
}
