import { describe, expect, it } from 'vitest'
import { findCustomersByEmailOrPhone, type CustomerLookupDeps, type CustomerLookupSummary } from './customerLookup.ts'

const ayesha: CustomerLookupSummary = {
  id: 'cust-1',
  customerNumber: 'AURA-1',
  firstName: 'Ayesha',
  lastName: 'Khan',
  email: 'ayesha@example.com',
  phone: '03079594474',
  status: 'active',
  hasAccount: true,
}

function makeDeps(rowsByEmail: CustomerLookupSummary[], rowsByPhone: CustomerLookupSummary[]): CustomerLookupDeps {
  return {
    async findByEmail() {
      return rowsByEmail
    },
    async findByPhone() {
      return rowsByPhone
    },
  }
}

describe('findCustomersByEmailOrPhone', () => {
  it('returns matches from email lookup only when phone is not queried', async () => {
    const deps = makeDeps([ayesha], [])
    const results = await findCustomersByEmailOrPhone(deps, { email: 'ayesha@example.com' })
    expect(results).toEqual([ayesha])
  })

  it('returns an empty array when nothing matches, without throwing', async () => {
    const deps = makeDeps([], [])
    const results = await findCustomersByEmailOrPhone(deps, { email: 'nobody@example.com' })
    expect(results).toEqual([])
  })

  it('de-duplicates a customer found via both email and phone', async () => {
    const deps = makeDeps([ayesha], [ayesha])
    const results = await findCustomersByEmailOrPhone(deps, {
      email: 'ayesha@example.com',
      phone: '03079594474',
    })
    expect(results).toHaveLength(1)
  })
})
