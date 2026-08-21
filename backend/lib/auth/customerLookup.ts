/**
 * Admin-safe customer lookup service. This is a plain function, not a UI —
 * the full Admin Customer module (search UI, edit, notes, order history) is
 * Phase 12. Phase 2 only needs this to exist so that:
 *   - a future admin Edge Function can look up "is this email/phone already
 *     a customer?" without duplicating query logic, and
 *   - it can be unit tested in isolation from any specific admin surface.
 *
 * Only returns the minimal fields an admin lookup needs — never raw
 * marketing consent history, order data, or anything beyond identity +
 * status. Callers are responsible for verifying the caller is an admin
 * (see authorization.ts) before invoking this.
 */

export interface CustomerLookupSummary {
  id: string
  customerNumber: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  status: 'active' | 'inactive' | 'blocked'
  hasAccount: boolean // true when linked to a profile (registered), false when guest-only
}

export interface CustomerLookupDeps {
  findByEmail(email: string): Promise<CustomerLookupSummary[]>
  findByPhone(phone: string): Promise<CustomerLookupSummary[]>
}

export interface CustomerLookupQuery {
  email?: string
  phone?: string
}

/**
 * Looks up customers by email and/or phone, de-duplicating by id. Returns
 * an empty array (never throws NotFoundError) — a lookup with no matches is
 * a normal, expected outcome for an admin search, not an error.
 */
export async function findCustomersByEmailOrPhone(
  deps: CustomerLookupDeps,
  query: CustomerLookupQuery,
): Promise<CustomerLookupSummary[]> {
  const results: CustomerLookupSummary[] = []
  if (query.email) results.push(...(await deps.findByEmail(query.email)))
  if (query.phone) results.push(...(await deps.findByPhone(query.phone)))

  const seen = new Set<string>()
  return results.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}
