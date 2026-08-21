import { describe, expect, it } from 'vitest'
import { ensureCustomerForProfile, type CustomerRow, type LinkCustomerDeps } from './linking.ts'

function makeFakeDeps(initialCustomers: CustomerRow[] = []): LinkCustomerDeps & { customers: CustomerRow[] } {
  const customers = [...initialCustomers]
  let seq = 0
  return {
    customers,
    async findCustomerByProfileId(profileId) {
      return customers.find((c) => c.profileId === profileId) ?? null
    },
    async findGuestCustomerByEmail(email) {
      return customers.find((c) => c.profileId === null && c.email === email) ?? null
    },
    async findGuestCustomerByPhone(phone) {
      return customers.find((c) => c.profileId === null && c.phone === phone) ?? null
    },
    async updateCustomer(id, patch) {
      const idx = customers.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error('not found')
      const existing = customers[idx] as CustomerRow
      const updated: CustomerRow = {
        ...existing,
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.marketingOptIn !== undefined ? { marketingOptIn: patch.marketingOptIn } : {}),
        ...(patch.profileId !== undefined ? { profileId: patch.profileId } : {}),
      }
      customers[idx] = updated
      return updated
    },
    async insertCustomer(row) {
      seq += 1
      const created: CustomerRow = {
        id: `customer-${seq}`,
        profileId: row.profileId,
        customerNumber: row.customerNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        marketingOptIn: row.marketingOptIn,
        status: 'active',
      }
      customers.push(created)
      return created
    },
    generateCustomerNumber: () => `AURA-TEST-${seq + 1}`,
  }
}

describe('ensureCustomerForProfile', () => {
  it('creates a new customer when none exists', async () => {
    const deps = makeFakeDeps()
    const result = await ensureCustomerForProfile(deps, {
      profileId: 'profile-1',
      email: 'ayesha@example.com',
      firstName: 'Ayesha',
    })
    expect(result.created).toBe(true)
    expect(result.claimedGuestCustomer).toBe(false)
    expect(result.customer.profileId).toBe('profile-1')
    expect(deps.customers).toHaveLength(1)
  })

  it('is idempotent: calling twice for the same profile never creates a duplicate', async () => {
    const deps = makeFakeDeps()
    await ensureCustomerForProfile(deps, { profileId: 'profile-1', email: 'ayesha@example.com' })
    const second = await ensureCustomerForProfile(deps, { profileId: 'profile-1', email: 'ayesha@example.com' })
    expect(second.created).toBe(false)
    expect(deps.customers).toHaveLength(1)
  })

  it('updates the linked customer in place when email/phone changes, without creating a duplicate', async () => {
    const deps = makeFakeDeps()
    const first = await ensureCustomerForProfile(deps, { profileId: 'profile-1', email: 'old@example.com' })
    const second = await ensureCustomerForProfile(deps, { profileId: 'profile-1', email: 'new@example.com' })
    expect(second.created).toBe(false)
    expect(second.customer.id).toBe(first.customer.id)
    expect(second.customer.email).toBe('new@example.com')
    expect(deps.customers).toHaveLength(1)
  })

  it('claims an existing guest customer matched by email instead of creating a duplicate', async () => {
    const deps = makeFakeDeps([
      {
        id: 'guest-1',
        profileId: null,
        customerNumber: 'AURA-GUEST-1',
        firstName: 'Guest',
        lastName: null,
        email: 'guest@example.com',
        phone: null,
        marketingOptIn: false,
        status: 'active',
      },
    ])
    const result = await ensureCustomerForProfile(deps, { profileId: 'profile-1', email: 'guest@example.com' })
    expect(result.created).toBe(false)
    expect(result.claimedGuestCustomer).toBe(true)
    expect(result.customer.id).toBe('guest-1')
    expect(result.customer.profileId).toBe('profile-1')
    expect(deps.customers).toHaveLength(1)
  })

  it('claims an existing guest customer matched by phone when email does not match', async () => {
    const deps = makeFakeDeps([
      {
        id: 'guest-2',
        profileId: null,
        customerNumber: 'AURA-GUEST-2',
        firstName: null,
        lastName: null,
        email: null,
        phone: '03079594474',
        marketingOptIn: false,
        status: 'active',
      },
    ])
    const result = await ensureCustomerForProfile(deps, {
      profileId: 'profile-1',
      email: 'brandnew@example.com',
      phone: '03079594474',
    })
    expect(result.claimedGuestCustomer).toBe(true)
    expect(result.customer.id).toBe('guest-2')
    expect(deps.customers).toHaveLength(1)
  })
})
