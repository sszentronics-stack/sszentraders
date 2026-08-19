-- 0020_accounting_adjustment_type.sql
-- Phase 8 (LedGix ERP Integration) housekeeping: adds 'adjustment' to the
-- local_financial_transactions event-type vocabulary.
--
-- Context: Phase 10 (Easypaisa) and Phase 11 (Leopards) shipped with their
-- own self-contained inserts into local_financial_transactions instead of
-- calling Phase 7's accounting.service.ts, because both were built as
-- parallel sibling agents before Phase 7 existed (see their completion
-- reports' "Known limitations" sections). This phase consolidates both call
-- sites onto backend/services/accounting/accounting.service.ts. Easypaisa's
-- duplicate insert used the existing 'sale' type (now recordPaymentTransaction,
-- already a supported type — no schema change needed for that one).
-- Leopards' courier accounting-review flag used a 'adjustment' type that was
-- NEVER actually valid against the check constraint 0019 added (it would
-- have failed at insert time against a real database) — this migration adds
-- it properly so recordAdjustmentTransaction() (this phase's consolidated
-- replacement for backend/services/delivery/leopards/accountingReview.ts)
-- can persist it.

alter table local_financial_transactions
  drop constraint chk_local_financial_transactions_type;

alter table local_financial_transactions
  add constraint chk_local_financial_transactions_type check (
    transaction_type in (
      'sale',
      'payment',
      'cod_collection',
      'discount',
      'delivery_charge',
      'cancellation',
      'return',
      'refund',
      'adjustment'
    )
  );

comment on column local_financial_transactions.transaction_type is 'One of backend/lib/accounting''s FINANCIAL_TRANSACTION_TYPES. ''adjustment'' is a zero-amount operational flag for manual review (e.g. courier RTO/failed-delivery) — never a substitute for a real sale/refund/cancellation amount.';
