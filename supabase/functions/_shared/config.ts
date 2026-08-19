/**
 * Server-only configuration module for Supabase Edge Functions (Deno
 * runtime). This is the ONLY place Edge Function code should read
 * `Deno.env.get(...)` from — every function imports its config through
 * here, exactly mirroring the pattern in src/lib/config/env.ts on the
 * frontend side (see that file's header comment for the shared rationale).
 *
 * These variables are set via `supabase secrets set` (or the Supabase
 * dashboard's Edge Function secrets UI) — never committed, never present in
 * the Vite build. See .env.example at the repo root for the full
 * authoritative variable list and backend/config/README.md for how the two
 * relate.
 */

function readOptional(name: string): string | undefined {
  const value = Deno.env.get(name)
  return value && value.length > 0 ? value : undefined
}

function readRequired(name: string): string {
  const value = readOptional(name)
  if (!value) {
    throw new Error(
      `Missing required Edge Function secret "${name}". Set it with ` +
        `\`supabase secrets set ${name}=...\` (see .env.example for the full list).`,
    )
  }
  return value
}

export function getSupabaseAdminConfig() {
  return {
    url: readRequired('SUPABASE_URL'),
    serviceRoleKey: readRequired('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

/** Returns null (rather than throwing) when unset, so provider skeletons can report IntegrationNotConfiguredError instead of crashing the function boot. */
export function getLedGixConfig() {
  const apiBaseUrl = readOptional('LEDGIX_API_BASE_URL')
  const apiKey = readOptional('LEDGIX_API_KEY')
  const companyId = readOptional('LEDGIX_COMPANY_ID')
  if (!apiBaseUrl || !apiKey || !companyId) return null
  return { apiBaseUrl, apiKey, companyId }
}

export function getEasypaisaConfig() {
  const merchantId = readOptional('EASYPAISA_MERCHANT_ID')
  const storeId = readOptional('EASYPAISA_STORE_ID')
  const hashKey = readOptional('EASYPAISA_HASH_KEY')
  const apiBaseUrl = readOptional('EASYPAISA_API_BASE_URL')
  const webhookSecret = readOptional('EASYPAISA_WEBHOOK_SECRET')
  if (!merchantId || !storeId || !hashKey || !apiBaseUrl || !webhookSecret) return null
  return { merchantId, storeId, hashKey, apiBaseUrl, webhookSecret }
}

export function getLeopardsConfig() {
  const apiKey = readOptional('LEOPARDS_API_KEY')
  const apiPassword = readOptional('LEOPARDS_API_PASSWORD')
  const apiBaseUrl = readOptional('LEOPARDS_API_BASE_URL')
  if (!apiKey || !apiPassword || !apiBaseUrl) return null
  return { apiKey, apiPassword, apiBaseUrl }
}
