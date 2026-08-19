/**
 * Customer synchronization/mapping — Phase 8 (LedGix ERP Integration).
 *
 * Aura customers link to LedGix ERP customer records via
 * `customers.ledgix_customer_id` (Phase 1's schema, still null for every
 * row today). This module builds the resolve-or-create SHAPE the spec
 * asks for: check for an existing mapping first, and only ever call
 * "create in ERP" when one is absent — so a customer can never be
 * duplicated in LedGix by repeated sync attempts. Right now,
 * `provider.upsertCustomer()` always throws `IntegrationNotConfiguredError`
 * (see LedGixErpProvider), so `resolveOrCreateErpCustomer()` propagates
 * that unchanged for any customer without an existing mapping — it never
 * fabricates a `ledgixCustomerId`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ErpProvider } from '../../../lib/providers/ErpProvider'
import { decideCustomerSync } from '../../../lib/erp'
import { NotFoundError } from '../../../lib/errors'

export interface CustomerForErpSync {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

export interface ErpCustomerMappingResult {
  ledgixCustomerId: string
  /** True only when this call actually created a new LedGix customer just now; false when an existing mapping was reused. */
  created: boolean
}

async function getExistingMapping(db: SupabaseClient, customerId: string): Promise<{ ledgixCustomerId: string | null } | null> {
  const { data, error } = await db.from('customers').select('ledgix_customer_id').eq('id', customerId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ledgixCustomerId: (data.ledgix_customer_id as string | null) ?? null }
}

/**
 * Resolve an existing `customers.ledgix_customer_id` mapping, or create one
 * via `provider.upsertCustomer()` if absent. Never calls `upsertCustomer`
 * when a mapping already exists — the whole point of this function is to
 * prevent uncontrolled duplication of the same customer in LedGix.
 *
 * On a fresh create that actually succeeds (not possible today —
 * `upsertCustomer` always throws until real LedGix credentials exist), the
 * new `ledgixCustomerId` is persisted back onto the `customers` row before
 * returning, so a concurrent/retried call for the same customer will find
 * the mapping already resolved on its next attempt.
 */
export async function resolveOrCreateErpCustomer(
  db: SupabaseClient,
  provider: ErpProvider,
  customer: CustomerForErpSync,
): Promise<ErpCustomerMappingResult> {
  const existing = await getExistingMapping(db, customer.id)
  if (!existing) throw new NotFoundError('Customer', `Customer "${customer.id}" was not found — cannot resolve an ERP mapping for it.`)

  const decision = decideCustomerSync(existing.ledgixCustomerId)
  if (decision.action === 'use_existing') {
    return { ledgixCustomerId: decision.ledgixCustomerId, created: false }
  }

  // decision.action === 'create': no mapping exists yet. This call
  // propagates IntegrationNotConfiguredError today — see this module's
  // header. It is only reached at all when no mapping was found, satisfying
  // "only call create in ERP if absent."
  const ref = await provider.upsertCustomer({
    customerId: customer.id,
    firstName: customer.firstName ?? undefined,
    lastName: customer.lastName ?? undefined,
    email: customer.email ?? undefined,
    phone: customer.phone ?? undefined,
  })

  const { error } = await db.from('customers').update({ ledgix_customer_id: ref.ledgixCustomerId }).eq('id', customer.id)
  if (error) throw error

  return { ledgixCustomerId: ref.ledgixCustomerId, created: true }
}
