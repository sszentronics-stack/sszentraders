/**
 * ErpProvider — the contract every ERP integration must satisfy.
 * LedGix (backend/lib/providers/ledgix/LedGixErpProvider.ts) is the only
 * implementation planned; the interface exists so accounting/inventory
 * service code depends on this abstraction, never on LedGix specifics
 * directly (see docs/phase-1-backend-foundation.md — ERP integration
 * architecture).
 */

export interface ErpCustomerRef {
  ledgixCustomerId: string
}

export interface ErpItemRef {
  ledgixItemId: string
}

export interface ErpInvoiceRef {
  ledgixInvoiceId: string
  ledgixInvoiceNumber: string
}

export interface ErpReceiptRef {
  ledgixReceiptId: string
  ledgixReceiptNumber: string
}

export interface ErpCreditNoteRef {
  ledgixCreditNoteId: string
  ledgixCreditNoteNumber: string
}

export interface ErpInventorySnapshot {
  ledgixItemId: string
  quantityOnHand: number
  quantityAvailable: number
  quantityReserved: number
  syncedAt: string
}

export interface UpsertCustomerInput {
  customerId: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

export interface CreateInvoiceInput {
  orderId: string
  ledgixCustomerId: string
  lineItems: Array<{ ledgixItemId: string; quantity: number; unitPrice: number }>
  currency: string
}

export interface RecordReceiptInput {
  ledgixInvoiceId: string
  amount: number
  currency: string
  paidAt: string
}

/**
 * Covers cancellation reversals, return credits, and refund documents — all
 * expressed to LedGix as a credit note against the original invoice.
 * `reason` is a free-text explanation (e.g. 'order_cancelled',
 * 'return_received', 'refund_issued') carried through for whatever field
 * LedGix's real API eventually wants it in; the exact shape is unconfirmed
 * (see backend/lib/providers/ledgix/LedGixErpProvider.ts's header comment).
 */
export interface RecordCreditNoteInput {
  orderId: string
  /** The invoice this credit note reverses, if one was ever created (may be absent if the sale never synced). */
  ledgixInvoiceId?: string
  amount: number
  currency: string
  reason: string
}

/**
 * ErpProvider is the single source of truth for accounting documents and
 * inventory. Aura's local tables (local_financial_transactions,
 * inventory_cache) are operational copies, never authoritative — see the
 * comments on those tables in supabase/migrations/0011 and 0012.
 */
export interface ErpProvider {
  readonly name: string

  upsertCustomer(input: UpsertCustomerInput): Promise<ErpCustomerRef>
  createInvoice(input: CreateInvoiceInput): Promise<ErpInvoiceRef>
  recordReceipt(input: RecordReceiptInput): Promise<ErpReceiptRef>
  recordCreditNote(input: RecordCreditNoteInput): Promise<ErpCreditNoteRef>
  getInventorySnapshot(ledgixItemIds: string[]): Promise<ErpInventorySnapshot[]>
}
