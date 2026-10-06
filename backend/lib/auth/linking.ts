/**
 * Profile <-> Customer linking logic for Phase 2 (Customer Authentication &
 * Profiles). This is the single authoritative implementation of "given an
 * authenticated Supabase Auth user (a `profiles` row), make sure there is
 * exactly one `customers` row representing their commerce identity" —
 * called from supabase/functions/auth/index.ts right after signup/login.
 *
 * Dependency-injected on purpose (see LinkCustomerDeps) rather than taking a
 * Supabase client directly: this file is runtime-agnostic (imported from
 * both the Deno Edge Function and Vitest), and injecting plain async
 * functions makes the dedup/linking business logic trivial to unit test
 * without mocking Supabase's fluent query builder.
 *
 * Dedup strategy (prevents duplicate `customers` rows when email/phone
 * changes or repeats):
 *   1. If a customer is already linked to this profile, update it in place
 *      and return it — never create a second row for an already-linked
 *      profile.
 *   2. Otherwise, look for an existing *guest* customer (profile_id IS NULL,
 *      created by a future guest-checkout flow) matching the incoming email
 *      first, then phone — and claim it by setting profile_id, rather than
 *      creating a duplicate. This is the foundation for "guest cart/order
 *      survives registration" (full cart merge is Phase 5).
 *   3. Otherwise, create a new customer row.
 */

export interface CustomerRow {
  id: string
  profileId: string | null
  customerNumber: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  marketingOptIn: boolean
  status: 'active' | 'inactive' | 'blocked'
}

export interface CustomerPatch {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  marketingOptIn?: boolean
}

export interface LinkCustomerInput {
  profileId: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  marketingOptIn?: boolean
}

export interface LinkCustomerDeps {
  findCustomerByProfileId(profileId: string): Promise<CustomerRow | null>
  findGuestCustomerByEmail(email: string): Promise<CustomerRow | null>
  findGuestCustomerByPhone(phone: string): Promise<CustomerRow | null>
  updateCustomer(id: string, patch: CustomerPatch & { profileId?: string }): Promise<CustomerRow>
  insertCustomer(row: {
    profileId: string
    customerNumber: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    marketingOptIn: boolean
  }): Promise<CustomerRow>
  /** Injectable for deterministic tests; defaults to a timestamp+random code. */
  generateCustomerNumber?: () => string
}

export interface LinkCustomerResult {
  customer: CustomerRow
  created: boolean
  claimedGuestCustomer: boolean
}

function defaultCustomerNumber(): string {
  const timePart = Date.now().toString(36).toUpperCase()
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `AURA-${timePart}-${randomPart}`
}

function blankText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export interface SignupMetadata {
  first_name?: unknown
  last_name?: unknown
  phone?: unknown
  marketing_opt_in?: unknown
}

/** Fields copied from signup metadata only where the profile is still empty. */
export function profilePatchFromSignup(
  profile: { first_name: string | null; last_name: string | null; phone: string | null },
  meta: SignupMetadata,
): { first_name?: string; last_name?: string; phone?: string } {
  const patch: { first_name?: string; last_name?: string; phone?: string } = {}
  if (!profile.first_name) {
    const firstName = blankText(meta.first_name)
    if (firstName) patch.first_name = firstName
  }
  if (!profile.last_name) {
    const lastName = blankText(meta.last_name)
    if (lastName) patch.last_name = lastName
  }
  if (!profile.phone) {
    const phone = blankText(meta.phone)
    if (phone) patch.phone = phone
  }
  return patch
}

/**
 * Values to pass into ensureCustomerForProfile. Existing name, phone, and
 * marketing choice are left alone. Marketing opt-in is sent only when a new
 * customer is being created and signup actually recorded a choice.
 */
export function customerFillFromSignup(
  existing: CustomerRow | null,
  profile: { first_name: string | null; last_name: string | null; phone: string | null },
  meta: SignupMetadata,
): Pick<LinkCustomerInput, 'firstName' | 'lastName' | 'phone' | 'marketingOptIn'> {
  const fill: Pick<LinkCustomerInput, 'firstName' | 'lastName' | 'phone' | 'marketingOptIn'> = {}
  if (!existing?.firstName && profile.first_name) fill.firstName = profile.first_name
  if (!existing?.lastName && profile.last_name) fill.lastName = profile.last_name
  if (!existing?.phone && profile.phone) fill.phone = profile.phone
  if (!existing && typeof meta.marketing_opt_in === 'boolean') fill.marketingOptIn = meta.marketing_opt_in
  return fill
}

/** Only overwrite an existing field when the caller explicitly supplied a new, non-empty value. */
function mergePatch(existing: CustomerRow, input: LinkCustomerInput): CustomerPatch {
  const patch: CustomerPatch = {}
  if (input.firstName !== undefined && input.firstName !== existing.firstName) patch.firstName = input.firstName
  if (input.lastName !== undefined && input.lastName !== existing.lastName) patch.lastName = input.lastName
  if (input.email !== undefined && input.email !== null && input.email !== existing.email) patch.email = input.email
  if (input.phone !== undefined && input.phone !== null && input.phone !== existing.phone) patch.phone = input.phone
  if (input.marketingOptIn !== undefined && input.marketingOptIn !== existing.marketingOptIn) {
    patch.marketingOptIn = input.marketingOptIn
  }
  return patch
}

export async function ensureCustomerForProfile(
  deps: LinkCustomerDeps,
  input: LinkCustomerInput,
): Promise<LinkCustomerResult> {
  const existing = await deps.findCustomerByProfileId(input.profileId)
  if (existing) {
    const patch = mergePatch(existing, input)
    const customer = Object.keys(patch).length > 0 ? await deps.updateCustomer(existing.id, patch) : existing
    return { customer, created: false, claimedGuestCustomer: false }
  }

  let guestMatch: CustomerRow | null = null
  if (input.email) guestMatch = await deps.findGuestCustomerByEmail(input.email)
  if (!guestMatch && input.phone) guestMatch = await deps.findGuestCustomerByPhone(input.phone)

  if (guestMatch) {
    const patch = mergePatch(guestMatch, input)
    const customer = await deps.updateCustomer(guestMatch.id, { ...patch, profileId: input.profileId })
    return { customer, created: false, claimedGuestCustomer: true }
  }

  const customerNumber = (deps.generateCustomerNumber ?? defaultCustomerNumber)()
  const customer = await deps.insertCustomer({
    profileId: input.profileId,
    customerNumber,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    marketingOptIn: input.marketingOptIn ?? false,
  })
  return { customer, created: true, claimedGuestCustomer: false }
}
