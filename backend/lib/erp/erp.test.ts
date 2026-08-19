import { describe, expect, it } from 'vitest'
import { IntegrationNotConfiguredError } from '../providers/errors.ts'
import {
  classifyErpSyncError,
  decideCustomerSync,
  isRetryableErpSyncError,
  mapFinancialEventToErpAction,
  reconcileLocalWithErp,
  type ErpReconciliationRecord,
  type LocalReconciliationRecord,
} from './index.ts'

describe('mapFinancialEventToErpAction', () => {
  it('maps sale to invoice', () => {
    expect(mapFinancialEventToErpAction('sale')).toBe('invoice')
  })
  it('maps payment and cod_collection to receipt', () => {
    expect(mapFinancialEventToErpAction('payment')).toBe('receipt')
    expect(mapFinancialEventToErpAction('cod_collection')).toBe('receipt')
  })
  it('maps cancellation/return/refund to credit_note', () => {
    expect(mapFinancialEventToErpAction('cancellation')).toBe('credit_note')
    expect(mapFinancialEventToErpAction('return')).toBe('credit_note')
    expect(mapFinancialEventToErpAction('refund')).toBe('credit_note')
  })
  it('skips discount and delivery_charge (netted into the sale invoice)', () => {
    expect(mapFinancialEventToErpAction('discount')).toBe('skip')
    expect(mapFinancialEventToErpAction('delivery_charge')).toBe('skip')
  })
})

describe('classifyErpSyncError', () => {
  it('classifies IntegrationNotConfiguredError as not_configured', () => {
    expect(classifyErpSyncError(new IntegrationNotConfiguredError('LedGix ERP'))).toBe('not_configured')
  })
  it('classifies a TypeError (e.g. network-layer failure) as transient', () => {
    expect(classifyErpSyncError(new TypeError('fetch failed'))).toBe('transient')
  })
  it('classifies an unrecognized error as permanent', () => {
    expect(classifyErpSyncError(new Error('unexpected'))).toBe('permanent')
  })
  it('not_configured and transient are retryable; permanent is not', () => {
    expect(isRetryableErpSyncError('not_configured')).toBe(true)
    expect(isRetryableErpSyncError('transient')).toBe(true)
    expect(isRetryableErpSyncError('permanent')).toBe(false)
  })
})

describe('decideCustomerSync', () => {
  it('uses the existing mapping and does not decide to create when one already exists', () => {
    expect(decideCustomerSync('ledgix-cust-1')).toEqual({ action: 'use_existing', ledgixCustomerId: 'ledgix-cust-1' })
  })
  it('decides to create when no mapping exists yet', () => {
    expect(decideCustomerSync(null)).toEqual({ action: 'create' })
    expect(decideCustomerSync(undefined)).toEqual({ action: 'create' })
  })
})

describe('reconcileLocalWithErp', () => {
  it('returns no issues when everything matches', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-1', transactionType: 'sale', amount: 5000, ledgixDocumentId: 'inv-1', syncStatus: 'succeeded' },
    ]
    const erp: ErpReconciliationRecord[] = [{ ledgixDocumentId: 'inv-1', amount: 5000 }]
    expect(reconcileLocalWithErp(local, erp)).toEqual([])
  })

  it('flags a succeeded local record with no ledgix_document_id as a bug', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-2', transactionType: 'sale', amount: 1000, ledgixDocumentId: null, syncStatus: 'succeeded' },
    ]
    const issues = reconcileLocalWithErp(local, [])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ type: 'local_succeeded_erp_missing', localTransactionId: 'tx-2' })
  })

  it('flags a succeeded local record whose ERP document is missing from the snapshot', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-3', transactionType: 'sale', amount: 1000, ledgixDocumentId: 'inv-3', syncStatus: 'succeeded' },
    ]
    const issues = reconcileLocalWithErp(local, [])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ type: 'local_succeeded_erp_missing', ledgixDocumentId: 'inv-3' })
  })

  it('flags an amount mismatch between the local record and its ERP document', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-4', transactionType: 'sale', amount: 1000, ledgixDocumentId: 'inv-4', syncStatus: 'succeeded' },
    ]
    const erp: ErpReconciliationRecord[] = [{ ledgixDocumentId: 'inv-4', amount: 1200 }]
    const issues = reconcileLocalWithErp(local, erp)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ type: 'amount_mismatch', localTransactionId: 'tx-4' })
  })

  it('flags two local records that both claim the same ERP document reference', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-5a', transactionType: 'sale', amount: 1000, ledgixDocumentId: 'inv-5', syncStatus: 'succeeded' },
      { id: 'tx-5b', transactionType: 'payment', amount: 1000, ledgixDocumentId: 'inv-5', syncStatus: 'succeeded' },
    ]
    const erp: ErpReconciliationRecord[] = [{ ledgixDocumentId: 'inv-5', amount: 1000 }]
    const issues = reconcileLocalWithErp(local, erp)
    expect(issues.some((i) => i.type === 'duplicate_erp_reference')).toBe(true)
  })

  it('does not flag pending/failed local records that have no ledgix_document_id yet — that is the normal not-configured state', () => {
    const local: LocalReconciliationRecord[] = [
      { id: 'tx-6', transactionType: 'sale', amount: 1000, ledgixDocumentId: null, syncStatus: 'failed' },
      { id: 'tx-7', transactionType: 'sale', amount: 1000, ledgixDocumentId: null, syncStatus: 'pending' },
    ]
    expect(reconcileLocalWithErp(local, [])).toEqual([])
  })
})
