/**
 * PaymentProvider — the contract every payment integration must satisfy.
 * Easypaisa (backend/lib/providers/easypaisa/EasypaisaProvider.ts) is the
 * planned Phase 10 implementation. `ManualPaymentProvider`-style flows
 * (cash on delivery, WhatsApp-negotiated payment) are handled entirely in
 * application logic and do not need this interface.
 */

export interface InitiatePaymentInput {
  orderId: string
  amount: number // minor units — see backend/lib/money
  currency: string
  customerPhone?: string
  returnUrl?: string
}

export interface InitiatePaymentResult {
  providerTransactionId: string
  redirectUrl?: string
  status: 'pending' | 'processing'
}

export interface VerifyPaymentInput {
  providerTransactionId: string
}

export interface VerifyPaymentResult {
  providerTransactionId: string
  status: 'paid' | 'failed' | 'pending' | 'processing' | 'cancelled'
  paidAt?: string
  amount?: number
}

export interface RefundPaymentInput {
  providerTransactionId: string
  amount: number // minor units, may be a partial refund
  reason?: string
}

export interface RefundPaymentResult {
  providerRefundId: string
  status: 'refunded' | 'partially_refunded' | 'failed'
}

export interface PaymentProvider {
  readonly name: string

  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>
}
