/**
 * Thin wrapper around `supabase.functions.invoke` for calling this project's
 * Supabase Edge Functions from the browser. Centralized here (rather than
 * called ad hoc from components/repositories/context) so there is exactly
 * one place that knows how errors from the standard envelope
 * (backend/lib/response) get turned into a thrown JS Error with a readable
 * message.
 */
import { getSupabaseBrowserClient } from './client'

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
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

  return data as T
}
