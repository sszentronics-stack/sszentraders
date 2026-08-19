import { describe, expect, it } from 'vitest'
import { AuthenticationError, AuthorizationError } from '../errors'
import {
  assertOwnsCustomerResource,
  assertOwnsResource,
  requireAuthenticatedProfile,
  type AuthenticatedProfile,
} from './authorization'

const customer: AuthenticatedProfile = { id: 'profile-1', authUserId: 'auth-1', isAdmin: false }
const admin: AuthenticatedProfile = { id: 'profile-admin', authUserId: 'auth-admin', isAdmin: true }

describe('requireAuthenticatedProfile', () => {
  it('returns the profile when present', () => {
    expect(requireAuthenticatedProfile(customer)).toBe(customer)
  })

  it('throws AuthenticationError when profile is null', () => {
    expect(() => requireAuthenticatedProfile(null)).toThrow(AuthenticationError)
  })
})

describe('assertOwnsResource', () => {
  it('allows access when the caller owns the resource', () => {
    expect(() =>
      assertOwnsResource({ caller: customer, resourceOwnerProfileId: 'profile-1', resourceLabel: 'profile' }),
    ).not.toThrow()
  })

  it('denies access to another customer\'s resource', () => {
    expect(() =>
      assertOwnsResource({ caller: customer, resourceOwnerProfileId: 'profile-2', resourceLabel: 'profile' }),
    ).toThrow(AuthorizationError)
  })

  it('always allows admins', () => {
    expect(() =>
      assertOwnsResource({ caller: admin, resourceOwnerProfileId: 'profile-2', resourceLabel: 'profile' }),
    ).not.toThrow()
  })
})

describe('assertOwnsCustomerResource', () => {
  it('allows access when caller customer id matches resource customer id', () => {
    expect(() =>
      assertOwnsCustomerResource({
        caller: customer,
        callerCustomerId: 'cust-1',
        resourceOwnerCustomerId: 'cust-1',
        resourceLabel: 'address',
      }),
    ).not.toThrow()
  })

  it('denies cross-customer access', () => {
    expect(() =>
      assertOwnsCustomerResource({
        caller: customer,
        callerCustomerId: 'cust-1',
        resourceOwnerCustomerId: 'cust-2',
        resourceLabel: 'address',
      }),
    ).toThrow(AuthorizationError)
  })

  it('denies when caller has no linked customer yet', () => {
    expect(() =>
      assertOwnsCustomerResource({
        caller: customer,
        callerCustomerId: null,
        resourceOwnerCustomerId: 'cust-2',
        resourceLabel: 'address',
      }),
    ).toThrow(AuthorizationError)
  })
})
