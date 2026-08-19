/**
 * Browser/anon Supabase client for the Vite storefront. This is the ONLY
 * place in `src/` that is allowed to construct a Supabase client — every
 * repository in src/repositories imports `getSupabaseBrowserClient` from
 * here rather than calling `createClient` itself.
 *
 * This client is created with the public anon key only. It relies entirely
 * on the RLS policies in supabase/migrations/0014_row_level_security.sql to
 * keep data access scoped correctly (anonymous read of published catalog
 * data, authenticated read/write of the caller's own rows). It must NEVER
 * be constructed with the service-role key — that key only exists inside
 * Supabase Edge Functions (see supabase/functions/_shared/supabaseAdmin.ts),
 * which runs in a separate, non-browser runtime.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig, hasSupabaseConfig } from '../config/env'

let client: SupabaseClient | null = null

/**
 * Lazily creates (and caches) the browser Supabase client. Throws the same
 * clear MissingEnvVarError as getSupabaseConfig() if called before
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are configured — callers that
 * need to degrade gracefully (e.g. keep the WhatsApp/local-data storefront
 * working with no Supabase project yet) should check `isSupabaseConfigured()`
 * first, which is the feature-flag boundary for anything Supabase-backed.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client
  const { url, anonKey } = getSupabaseConfig()
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return client
}

/** Feature-flag boundary: gate any Supabase-backed UI/data path on this. */
export function isSupabaseConfigured(): boolean {
  return hasSupabaseConfig()
}
