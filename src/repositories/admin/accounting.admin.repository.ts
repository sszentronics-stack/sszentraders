/** Admin accounting/ERP sync center — wraps the `accounting` Edge Function (Phases 7 & 8, extended in Phase 12 with /integrations/status). */
import { callEdgeFunction } from '../../lib/supabase/functions'

export function listUnsyncedFinancialEvents(limit = 100) {
  return callEdgeFunction<{ events: any[] }>(`accounting/unsynced?limit=${limit}`, { method: 'GET' })
}

export function retryFinancialEventSync(transactionId: string) {
  return callEdgeFunction<{ transactionId: string; status: string }>(`accounting/${transactionId}/retry`, { method: 'POST' })
}

export function syncFinancialEventNow(transactionId: string) {
  return callEdgeFunction<any>(`accounting/${transactionId}/sync`, { method: 'POST' })
}

export function getErpHealth() {
  return callEdgeFunction<{ provider: string; configured: boolean; pendingSyncCount: number }>('accounting/erp/health', { method: 'GET' })
}

export function runErpReconciliation() {
  return callEdgeFunction<{ issues: any[] }>('accounting/erp/reconciliation', { method: 'GET' })
}

export interface IntegrationsStatus {
  ledgix: { configured: boolean }
  easypaisa: { configured: boolean }
  leopards: { configured: boolean }
}

export function getIntegrationsStatus() {
  return callEdgeFunction<IntegrationsStatus>('accounting/integrations/status', { method: 'GET' })
}
