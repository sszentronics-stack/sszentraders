import type {
  CreateInvoiceInput,
  ErpCreditNoteRef,
  ErpCustomerRef,
  ErpInvoiceRef,
  ErpInventorySnapshot,
  ErpProvider,
  ErpReceiptRef,
  RecordCreditNoteInput,
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
 * LedGix ERP provider — Phase 1 shipped this as a skeleton so
 * accounting/inventory code could be written against the ErpProvider
 * interface before any live LedGix credentials existed. Phase 8 (LedGix ERP
 * Integration) is this file's owner going forward, but **no real LedGix API
 * documentation or credentials are available in this project**, so every
 * method still throws IntegrationNotConfiguredError, whether or not
 * `LEDGIX_API_BASE_URL`/`LEDGIX_API_KEY`/`LEDGIX_COMPANY_ID` are set —
 * configuration presence alone must never be mistaken for a working
 * integration (same rule Phase 10/11 followed for Easypaisa/Leopards). No
 * endpoint path, request/response field name, or authentication scheme is
 * fabricated anywhere in this file. Whoever gets real LedGix docs/credentials
 * should replace each method body's `throw` with the real HTTP call —
 * nothing else in this file (or the services that call it) should need to
 * change, since backend/services/erp/ledgix/ already codes against this
 * class only through the ErpProvider interface.
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

  /** Covers cancellation reversals, return credits, and refund documents — see RecordCreditNoteInput's doc comment. */
  async recordCreditNote(_input: RecordCreditNoteInput): Promise<ErpCreditNoteRef> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'recordCreditNote is not implemented until Phase 8.')
  }

  async getInventorySnapshot(_ledgixItemIds: string[]): Promise<ErpInventorySnapshot[]> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'getInventorySnapshot is not implemented until Phase 9.')
  }
}
