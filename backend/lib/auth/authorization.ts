/**
 * Server-side authorization helpers for customer-owned resources
 * (addresses, profile, and — in later phases — orders/returns). Intended
 * to be reused by every current and future Edge Function that touches a
 * row scoped to a single customer, so ownership checks are written once and
 * consistently rather than re-derived ad hoc per handler.
 *
 * These helpers are *defense in depth* — RLS (supabase/migrations/0014_row_
 * row_level_security.sql) is the primary enforcement boundary and already
 * denies cross-customer access at the database level. Edge Functions use
 * the service-role key (which bypasses RLS), so anything running with that
 * client MUST call these helpers explicitly before reading/writing a
 * customer-scoped row — never trust a customerId/profileId/addressId
 * supplied by the browser without verifying it belongs to the caller.
 */
import { AuthenticationError, AuthorizationError } from '../errors'

export interface AuthenticatedProfile {
  id: string
  authUserId: string
  isAdmin: boolean
}

/** Throws AuthenticationError if `profile` is null/undefined — narrows the type for callers. */
export function requireAuthenticatedProfile(
  profile: AuthenticatedProfile | null | undefined,
): AuthenticatedProfile {
  if (!profile) throw new AuthenticationError('A signed-in profile is required for this action.')
  return profile
}

/**
 * Throws AuthorizationError unless the resource's owning profileId matches
 * the caller's profileId (or the caller is an admin). Use this for any
 * privileged (service-role) read/write of a row that has a profile-derived
 * owner — e.g. "does this address's customer belong to this profile?".
 */
export function assertOwnsResource(params: {
  caller: AuthenticatedProfile
  resourceOwnerProfileId: string | null
  resourceLabel: string
}): void {
  const { caller, resourceOwnerProfileId, resourceLabel } = params
  if (caller.isAdmin) return
  if (!resourceOwnerProfileId || resourceOwnerProfileId !== caller.id) {
    throw new AuthorizationError(`You do not have permission to access this ${resourceLabel}.`)
  }
}

/**
 * Same idea, scoped to a customerId rather than a profileId directly (the
 * common case: addresses/orders hang off `customers`, not `profiles`
 * directly). `resourceOwnerCustomerId` is the customer_id column on the row
 * being accessed; `callerCustomerId` is the customer_id resolved for the
 * authenticated caller (e.g. via customers.profile_id = caller.id).
 */
export function assertOwnsCustomerResource(params: {
  caller: AuthenticatedProfile
  callerCustomerId: string | null
  resourceOwnerCustomerId: string | null
  resourceLabel: string
}): void {
  const { caller, callerCustomerId, resourceOwnerCustomerId, resourceLabel } = params
  if (caller.isAdmin) return
  if (!callerCustomerId || !resourceOwnerCustomerId || callerCustomerId !== resourceOwnerCustomerId) {
    throw new AuthorizationError(`You do not have permission to access this ${resourceLabel}.`)
  }
}
