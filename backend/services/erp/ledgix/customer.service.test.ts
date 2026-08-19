import { describe, expect, it } from 'vitest'
import type { ErpProvider, ErpCustomerRef, UpsertCustomerInput } from '../../../lib/providers/ErpProvider'
import { LedGixErpProvider } from '../../../lib/providers/ledgix/LedGixErpProvider'
import { IntegrationNotConfiguredError } from '../../../lib/providers/errors'
import { NotFoundError } from '../../../lib/errors'
import { resolveOrCreateErpCustomer } from './customer.service'
import { FakeSupabaseClient } from './testUtils'

function asSupabase(db: FakeSupabaseClient) {
  return db as unknown as import('@supabase/supabase-js').SupabaseClient
}

class ThrowingIfCalledProvider implements ErpProvider {
  readonly name = 'test-provider'
  async upsertCustomer(_input: UpsertCustomerInput): Promise<ErpCustomerRef> {
    throw new Error('upsertCustomer should not have been called when a mapping already exists')
  }
  createInvoice = notNeeded
  recordReceipt = notNeeded
  recordCreditNote = notNeeded
  getInventorySnapshot = notNeeded
}
function notNeeded(): never {
  throw new Error('not needed for this test')
}

class FakeSucceedingProvider implements ErpProvider {
  readonly name = 'fake-ledgix'
  async upsertCustomer(input: UpsertCustomerInput): Promise<ErpCustomerRef> {
    return { ledgixCustomerId: `ledgix-${input.customerId}` }
  }
  createInvoice = notNeeded
  recordReceipt = notNeeded
  recordCreditNote = notNeeded
  getInventorySnapshot = notNeeded
}

describe('resolveOrCreateErpCustomer', () => {
  it('reuses an existing mapping and never calls upsertCustomer', async () => {
    const db = new FakeSupabaseClient()
    db.seed('customers', [{ id: 'cust-1', ledgix_customer_id: 'ledgix-existing' }])

    const result = await resolveOrCreateErpCustomer(asSupabase(db), new ThrowingIfCalledProvider(), { id: 'cust-1' })
    expect(result).toEqual({ ledgixCustomerId: 'ledgix-existing', created: false })
  })

  it('calls upsertCustomer and persists the mapping when none exists yet', async () => {
    const db = new FakeSupabaseClient()
    db.seed('customers', [{ id: 'cust-2', ledgix_customer_id: null, first_name: 'Ayesha', last_name: 'Khan' }])

    const result = await resolveOrCreateErpCustomer(asSupabase(db), new FakeSucceedingProvider(), {
      id: 'cust-2',
      firstName: 'Ayesha',
      lastName: 'Khan',
    })
    expect(result).toEqual({ ledgixCustomerId: 'ledgix-cust-2', created: true })
    expect(db.getTable('customers')[0]?.ledgix_customer_id).toBe('ledgix-cust-2')
  })

  it('propagates IntegrationNotConfiguredError from the real LedGixErpProvider when no mapping exists', async () => {
    const db = new FakeSupabaseClient()
    db.seed('customers', [{ id: 'cust-3', ledgix_customer_id: null }])

    await expect(resolveOrCreateErpCustomer(asSupabase(db), new LedGixErpProvider(null), { id: 'cust-3' })).rejects.toBeInstanceOf(
      IntegrationNotConfiguredError,
    )
    // Never fabricates a mapping on failure.
    expect(db.getTable('customers')[0]?.ledgix_customer_id).toBeNull()
  })

  it('throws NotFoundError for a customer id that does not exist', async () => {
    const db = new FakeSupabaseClient()
    await expect(resolveOrCreateErpCustomer(asSupabase(db), new ThrowingIfCalledProvider(), { id: 'missing' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
