import { describe, expect, it } from 'vitest'
import { LedGixErpProvider } from './ledgix/LedGixErpProvider'
import { EasypaisaProvider } from './easypaisa/EasypaisaProvider'
import { LeopardsCourierProvider } from './leopards/LeopardsCourierProvider'
import { IntegrationNotConfiguredError } from './errors'

describe('integration provider skeletons', () => {
  it('LedGixErpProvider throws IntegrationNotConfiguredError when unconfigured', async () => {
    const provider = new LedGixErpProvider(null)
    await expect(
      provider.upsertCustomer({ customerId: 'c1' }),
    ).rejects.toBeInstanceOf(IntegrationNotConfiguredError)
    await expect(
      provider.getInventorySnapshot(['item-1']),
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
