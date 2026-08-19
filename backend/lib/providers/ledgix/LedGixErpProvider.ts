import type {
  CreateInvoiceInput,
  ErpCustomerRef,
  ErpInvoiceRef,
  ErpInventorySnapshot,
  ErpProvider,
  ErpReceiptRef,
  RecordReceiptInput,
  UpsertCustomerInput,
} from '../ErpProvider'
import { IntegrationNotConfiguredError } from '../errors'

export interface LedGixConfig {
  apiBaseUrl: string
  apiKey: string
  companyId: string
}

/**
 * Skeleton LedGix ERP provider. Phase 1 ships this so accounting/inventory
 * code can be written against the ErpProvider interface now, without any
 * live LedGix credentials existing yet. Every method throws
 * IntegrationNotConfiguredError until Phase 8 (LedGix ERP Integration)
 * implements the real HTTP calls — it never fabricates a success response.
 */
export class LedGixErpProvider implements ErpProvider {
  readonly name = 'LedGix ERP'

  constructor(private readonly config: LedGixConfig | null) {}

  private assertConfigured(): void {
    if (!this.config || !this.config.apiBaseUrl || !this.config.apiKey || !this.config.companyId) {
      throw new IntegrationNotConfiguredError(
        this.name,
        'Set LEDGIX_API_BASE_URL, LEDGIX_API_KEY, and LEDGIX_COMPANY_ID in the Edge Function environment.',
      )
    }
  }

  async upsertCustomer(_input: UpsertCustomerInput): Promise<ErpCustomerRef> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'upsertCustomer is not implemented until Phase 8.')
  }

  async createInvoice(_input: CreateInvoiceInput): Promise<ErpInvoiceRef> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'createInvoice is not implemented until Phase 8.')
  }

  async recordReceipt(_input: RecordReceiptInput): Promise<ErpReceiptRef> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'recordReceipt is not implemented until Phase 8.')
  }

  async getInventorySnapshot(_ledgixItemIds: string[]): Promise<ErpInventorySnapshot[]> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'getInventorySnapshot is not implemented until Phase 9.')
  }
}
