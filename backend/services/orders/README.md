# orders

**Phase:** 6

Checkout, address, delivery, payment, order creation, pricing snapshots, discounts, delivery charges, order status timeline, cancellation requests. Replaces WhatsApp-based checkout (WhatsApp remains an optional support channel).

Status: **implemented.** See `docs/phase-6-completion-report.md` for the full writeup.

## Phase 1 foundation
- Schema: `supabase/migrations/0006_orders.sql` (orders, order_items with price/name snapshots, order_status_history).
- Status machine: `backend/lib/status` (`ORDER_STATUSES`, `assertOrderStatusTransition`) — reused as-is.
- Money/totals math: `backend/lib/money` (`calculateLineTotal`, `calculateOrderTotals`) — reused as-is.
- Idempotent order creation groundwork: `backend/lib/idempotency` — now actually wired into `supabase/functions/orders/index.ts`.

## Phase 6 implementation
- Schema addition: `supabase/migrations/0018_order_address_snapshot.sql` (immutable shipping-address snapshot columns on `orders`).
- Pure domain logic: `backend/lib/orders` (order number generation, order-item snapshot building, flat-rate delivery cost).
- Order creation always derives its line items from the caller's own server-side cart (`backend/services/cart/cart.service.ts`'s `getCartSummary()`, Phase 5) — never from client-supplied items/prices.
- Service: `backend/services/orders/orders.service.ts` — create/read/list/cancel, guest order lookup by order-number+email.
- Edge Function: `supabase/functions/orders/index.ts` — idempotent order creation (`X-Idempotency-Key`), read, cancel, guest lookup.
- Frontend: `src/repositories/orders.repository.ts`, `src/pages/Checkout.jsx` (multi-step), `src/pages/OrderConfirmation.jsx`, `src/pages/account/Orders.jsx`.
