/**
 * ERP health/configuration-status — Phase 8. Service-layer only, per the
 * phase spec ("Phase 12 builds UI"). Reports whether a real LedGix
 * integration is configured without ever leaking credential values —
 * callers pass in the already-loaded config object (or null), and this
 * function only ever returns booleans/counts derived from it, never the
 * config itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LedGixConfig } from '../../../lib/providers/ledgix/LedGixErpProvider.ts'

export interface ErpHealthStatus {
  provider: 'ledgix'
  configured: boolean
  /** Total local_financial_transactions rows whose ERP sync job has not (yet) succeeded — a cheap "how much work is queued" signal, not a live ERP reachability check (no real call is ever made here). */
  pendingSyncCount: number
}

/**
 * `config` should be the already-loaded `LedGixConfig | null` (e.g. from
 * `supabase/functions/_shared/config.ts`'s `getLedGixConfig()`) — this
 * function never reads env itself, keeping it runtime-agnostic and
 * testable without Deno globals.
 */
export async function getErpHealthStatus(db: SupabaseClient, config: LedGixConfig | null): Promise<ErpHealthStatus> {
  const { count, error } = await db
    .from('erp_sync_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'ledgix')
    .in('status', ['pending', 'in_progress', 'failed'])
  if (error) throw error

  return {
    provider: 'ledgix',
    configured: Boolean(config?.apiBaseUrl && config?.apiKey && config?.companyId),
    pendingSyncCount: count ?? 0,
  }
}
