# reviews

**Phase:** 14

Verified-purchase reviews, star ratings, moderation, return requests/reasons/evidence, approval/rejection, Leopards return shipments, refunds, replacements, customer-service notes, full order activity timeline. Approved financial returns/refunds sync to LedGix ERP.

Status: not started (Phase 1 laid the foundation below).

## Phase 1 foundation
- Returns schema: `supabase/migrations/0009_returns.sql` (`returns`, `return_items`, `return_events`).
- Deployable code home: `supabase/functions/returns/index.ts` (currently `NotImplementedYetError`).
- No reviews schema exists yet — deferred entirely to Phase 14.
