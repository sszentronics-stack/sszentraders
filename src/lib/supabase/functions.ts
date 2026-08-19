/**
 * Thin wrapper around `supabase.functions.invoke` for calling this project's
 * Supabase Edge Functions from the browser. Centralized here (rather than
 * called ad hoc from components/repositories/context) so there is exactly
 * one place that knows how errors from the standard envelope
 * (backend/lib/response) get turned into a thrown JS Error with a readable
 * message.
 */
import { getSupabaseBrowserClient } from './client'
import type { SuccessEnvelope } from '../../../backend/lib/response/index'

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
}

/**
 * Phase 16 finding: every Edge Function returns backend/lib/response's
 * standard envelope on success — `{ ok: true, data: T }` (see okResponse in
 * supabase/functions/_shared/http.ts) — never the bare payload. This was
 * NOT being unwrapped here: `callEdgeFunction` returned `data as T`, so
 * every caller across every phase was actually receiving `{ ok, data }`
 * cast as `T` — every `.field` access on the result would be `undefined`
 * against a real Edge Function. Never caught in dev because no live
 * Supabase project exists in this environment to exercise a real
 * round trip. Fixed here, in the single shared call site.
 */
function isSuccessEnvelope<T>(value: unknown): value is SuccessEnvelope<T> {
  return Boolean(value && typeof value === 'object' && (value as { ok?: unknown }).ok === true && 'data' in (value as object))
}

/**
 * `name` may include a sub-path, e.g. "auth/profile" invokes the `auth`
 * Edge Function's `/profile` route (see supabase/functions/auth/index.ts).
 */
export async function callEdgeFunction<T>(
  name: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.functions.invoke(name, {
    method: options.method ?? 'POST',
    body: options.body as Record<string, unknown> | undefined,
    headers: options.headers,
  })

  if (error) {
    // supabase-js surfaces non-2xx responses as a generic FunctionsHttpError;
    // try to unwrap our own error envelope's message for a better UI string.
    const context = (error as { context?: Response }).context
    let unwrappedMessage: string | undefined
    if (context) {
      try {
        const body = (await context.clone().json()) as ErrorEnvelope
        unwrappedMessage = body?.error?.message
      } catch {
        // response body wasn't our JSON envelope — fall back to the generic message below
      }
    }
    throw new Error(unwrappedMessage ?? error.message ?? 'Request failed.')
  }

  return isSuccessEnvelope<T>(data) ? data.data : (data as T)
}
