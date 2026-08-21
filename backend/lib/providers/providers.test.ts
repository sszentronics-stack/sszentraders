import { describe, expect, it } from 'vitest'
import { LedGixErpProvider } from './ledgix/LedGixErpProvider.ts'
import { EasypaisaProvider } from './easypaisa/EasypaisaProvider.ts'
import { LeopardsCourierProvider } from './leopards/LeopardsCourierProvider.ts'
import { IntegrationNotConfiguredError } from './errors.ts'

describe('integration provider skeletons', () => {
  it('LedGixErpProvider throws IntegrationNotConfiguredError when unconfigured', async () => {
    const provider = new LedGixErpProvider(null)
    await expect(
      provider.upsertCustomer({ customerId: 'c1' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.createInvoice({ orderId: 'o1', ledgixCustomerId: 'c1', lineItems: [], currency: 'PKR' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.recordReceipt({ ledgixInvoiceId: 'inv-1', amount: 1000, currency: 'PKR', paidAt: new Date().toISOString() }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.recordCreditNote({ orderId: 'o1', amount: 1000, currency: 'PKR', reason: 'order_cancelled' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.getInventorySnapshot(['item-1']),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('LedGixErpProvider still rejects every method even when "configured" — config presence never implies a working integration', async () => {
    const provider = new LedGixErpProvider({ apiBaseUrl: 'https://example.test', apiKey: 'x', companyId: 'y' })
    await expect(provider.upsertCustomer({ customerId: 'c1' })).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.recordCreditNote({ orderId: 'o1', amount: 1000, currency: 'PKR', reason: 'return_received' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('EasypaisaProvider throws IntegrationNotConfiguredError when unconfigured', async () => {
    const provider = new EasypaisaProvider(null)
    await expect(
      provider.initiatePayment({ orderId: 'o1', amount: 1000, currency: 'PKR' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(provider.verifyPayment({ providerTransactionId: 't1' })).rejects.toBeInstanceOf(
      IntegrationNotConfiguredError,
    )
    await expect(
      provider.refundPayment({ providerTransactionId: 't1', amount: 500 }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('EasypaisaProvider still throws even when "configured" — configuration alone is never mistaken for success', async () => {
    const provider = new EasypaisaProvider({
      merchantId: 'm1',
      storeId: 's1',
      hashKey: 'h1',
      apiBaseUrl: 'https://example.test',
      webhookSecret: 'w1',
    })
    await expect(
      provider.initiatePayment({ orderId: 'o1', amount: 1000, currency: 'PKR' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('LeopardsCourierProvider throws IntegrationNotConfiguredError when unconfigured', async () => {
    const provider = new LeopardsCourierProvider(null)
    await expect(
      provider.createShipment({
        orderId: 'o1',
        recipientName: 'Test',
        recipientPhone: '030000000',
        addressLine1: 'Street 1',
        city: 'Lahore',
      }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(provider.trackShipment({ trackingNumber: 'LP1' })).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(provider.cancelShipment({ trackingNumber: 'LP1' })).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(provider.requestPickup({ trackingNumber: 'LP1' })).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.bookReturnPickup({
        returnId: 'r1',
        orderId: 'o1',
        recipientName: 'Test',
        recipientPhone: '030000000',
        addressLine1: 'Street 1',
        city: 'Lahore',
      }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('LeopardsCourierProvider still rejects even when "configured" — config presence never implies a working integration', async () => {
    const provider = new LeopardsCourierProvider({ apiKey: 'x', apiPassword: 'y', apiBaseUrl: 'https://example.test' })
    await expect(
      provider.createShipment({
        orderId: 'o1',
        recipientName: 'Test',
        recipientPhone: '030000000',
        addressLine1: 'Street 1',
        city: 'Lahore',
      }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
  })

  it('never returns a fake success payload — every skeleton method rejects', async () => {
    const erp = new LedGixErpProvider({ apiBaseUrl: 'https://example.test', apiKey: 'x', companyId: 'y' })
    // Even "configured" (non-null config), the unimplemented operation still throws —
    // configuration alone must never be mistaken for a working integration.
    await expect(erp.createInvoice({ orderId: 'o1', ledgixCustomerId: 'c1', lineItems: [], currency: 'PKR' })).rejects.toThrow(
      IntegrationNotConfiguredError,
    )
  })
})
