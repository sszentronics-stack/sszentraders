# orders

**Phase:** 6

Checkout, address, delivery, payment, order creation, pricing snapshots, discounts, delivery charges, order status timeline, cancellation requests. Replaces WhatsApp-based checkout (WhatsApp remains an optional support channel).

Status: not started (Phase 1 laid the foundation below). Current WhatsApp checkout (`src/data/products.js` `buildWhatsAppOrder`) is untouched and remains the live checkout path until Phase 6 ships.

## Phase 1 foundation
- Schema: `supabase/migrations/0006_orders.sql` (orders, order_items with price/name snapshots, order_status_history).
- Status machine: `backend/lib/status` (`ORDER_STATUSES`, `assertOrderStatusTransition`).
- Money/totals math: `backend/lib/money` (`calculateLineTotal`, `calculateOrderTotals`).
- Idempotent order creation groundwork: `backend/lib/idempotency`.
- Deployable code home: `supabase/functions/orders/index.ts` — validates the request shape but returns `NotImplementedYetError`; real creation logic is Phase 6.
