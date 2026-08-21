import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from '../PaymentProvider.ts'
import { IntegrationNotConfiguredError } from '../errors.ts'

export interface EasypaisaConfig {
  merchantId: string
  storeId: string
  hashKey: string
  apiBaseUrl: string
  webhookSecret: string
}

/**
 * Skeleton Easypaisa payment provider. No live payment calls are made in
 * Phase 1 — every method throws IntegrationNotConfiguredError, never a fake
 * `{ paymentSuccessful: true }`. Real implementation lands in Phase 10.
 */
export class EasypaisaProvider implements PaymentProvider {
  readonly name = 'Easypaisa'

  constructor(private readonly config: EasypaisaConfig | null) {}

  private assertConfigured(): void {
    if (
      !this.config ||
      !this.config.merchantId ||
      !this.config.storeId ||
      !this.config.hashKey ||
      !this.config.apiBaseUrl
    ) {
      throw new IntegrationNotConfiguredError(
        this.name,
        'Set EASYPAISA_MERCHANT_ID, EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY, and EASYPAISA_API_BASE_URL in the Edge Function environment.',
      )
    }
  }

  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'initiatePayment is not implemented until Phase 10.')
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'verifyPayment is not implemented until Phase 10.')
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    this.assertConfigured()
    throw new IntegrationNotConfiguredError(this.name, 'refundPayment is not implemented until Phase 10.')
  }
}
