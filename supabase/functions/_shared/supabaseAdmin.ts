// deno-lint-ignore-file no-explicit-any
/**
 * Service-role Supabase client — used ONLY inside Edge Functions. This
 * client bypasses Row Level Security entirely, so:
 *   - it must never be constructed anywhere reachable from the browser
 *     bundle (see src/lib/supabase/client.ts for the anon-key equivalent),
 *   - every function that uses it is responsible for its own
 *     authorization checks (verify the caller's JWT, check profiles.is_admin,
 *     scope queries to the caller's own customer_id, etc.) before touching
 *     data via this client,
 *   - it must never be logged (see backend/lib/logger's secret redaction).
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSupabaseAdminConfig } from './config.ts'

let adminClient: ReturnType<typeof createClient> | null = null

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient
  const { url, serviceRoleKey } = getSupabaseAdminConfig()
  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

/**
 * Builds a request-scoped client that acts AS the calling user (respecting
 * RLS) by forwarding their JWT, for functions that should honor the same
 * row-level security as direct client access rather than bypassing it.
 * Prefer this over getSupabaseAdminClient() whenever the operation doesn't
 * specifically require service-role privileges.
 */
export function getSupabaseUserScopedClient(authorizationHeader: string | null) {
  const { url } = getSupabaseAdminConfig()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  return createClient(url, anonKey, {
    global: { headers: authorizationHeader ? { Authorization: authorizationHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
