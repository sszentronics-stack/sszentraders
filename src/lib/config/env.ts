/**
 * Central, client-safe environment access for the Vite storefront.
 *
 * Rules enforced by this module:
 *  - Only `import.meta.env.VITE_*` variables are read here. Vite only
 *    exposes `VITE_`-prefixed variables to browser code in the first
 *    place, so anything server-only (SUPABASE_SERVICE_ROLE_KEY, LedGix,
 *    Easypaisa, Leopards secrets) physically cannot end up in this file's
 *    output — see backend/config/README.md and .env.example.
 *  - No other file in `src/` should read `import.meta.env` directly;
 *    everything goes through the getters below so there is exactly one
 *    place that knows the variable names and validates them.
 *  - Validation is LAZY: importing this module must never throw. Reading
 *    `getSupabaseConfig()` before the app has real env vars configured
 *    throws a clear, actionable error at the point of use — not at module
 *    load / build time — so `npm run build` and `npm run lint` keep
 *    working even with a blank `.env`.
 */

export interface SupabaseClientConfig {
  url: string
  anonKey: string
}

class MissingEnvVarError extends Error {
  constructor(name: string) {
    super(
      `Missing required environment variable "${name}". Copy .env.example to .env.local and fill in your ` +
        `Supabase project's URL/anon key (Project Settings -> API in the Supabase dashboard). ` +
        `Never put the service-role key here — only VITE_-prefixed, browser-safe values belong in this app.`,
    )
    this.name = 'MissingEnvVarError'
  }
}

function readOptional(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name]
  return value && value.length > 0 ? value : undefined
}

function readRequired(name: string): string {
  const value = readOptional(name)
  if (!value) throw new MissingEnvVarError(name)
  return value
}

let cachedSupabaseConfig: SupabaseClientConfig | null = null

/** Throws MissingEnvVarError with a helpful message if Supabase env vars are absent. */
export function getSupabaseConfig(): SupabaseClientConfig {
  if (cachedSupabaseConfig) return cachedSupabaseConfig
  // Supabase's new Connect UI labels this "publishable"; this app historically
  // uses VITE_SUPABASE_ANON_KEY. Accept either so either dashboard copy works.
  const anonKey =
    readOptional('VITE_SUPABASE_ANON_KEY') ?? readOptional('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!anonKey) throw new MissingEnvVarError('VITE_SUPABASE_ANON_KEY')
  cachedSupabaseConfig = {
    url: readRequired('VITE_SUPABASE_URL'),
    anonKey,
  }
  return cachedSupabaseConfig
}

/** Non-throwing check for feature-flag-style guards (see src/lib/supabase/client.ts). */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    readOptional('VITE_SUPABASE_URL') &&
      (readOptional('VITE_SUPABASE_ANON_KEY') || readOptional('VITE_SUPABASE_PUBLISHABLE_KEY')),
  )
}

export function getAppConfig() {
  return {
    appUrl: readOptional('VITE_APP_URL') ?? '',
    whatsappNumber: readOptional('VITE_WHATSAPP_SUPPORT_NUMBER') ?? '923079594474',
    environment: (readOptional('VITE_APP_ENV') ?? import.meta.env.MODE) as string,
  }
}
