# reviews

**Phase:** 14

Verified-purchase reviews, star ratings, moderation, return requests/reasons/evidence, approval/rejection, Leopards return shipments, refunds, replacements, customer-service notes, full order activity timeline. Approved financial returns/refunds sync to LedGix ERP.

Status: **implemented**.

## Module map

- `backend/lib/reviews/` — pure verified-purchase eligibility decision + aggregate-rating computation.
- `backend/lib/returns/` — pure reason-code vocabulary, evidence requirements, return-number generation, and the return-policy eligibility engine (delivered-date/window/quantity/reason). Return status transitions live in `backend/lib/status` alongside order/payment status.
- `reviews.service.ts` — review create/list/moderate + review-image signed upload.
- `returns.service.ts` — return request eligibility/creation, admin review/approve/reject, courier pickup handoff (reuses Phase 11's `bookReturnPickup`), received/inspection outcome, status timeline (`return_events`).
- `refund.service.ts` — the financial refund flow for a `refunded` return: reuses Phase 7's `accounting.service.ts` (never a second local-financial-event writer), Phase 10's `refundEasypaisaPayment` when applicable, and Phase 8's `attemptErpSync` (already maps `refund` → LedGix credit note — no new ERP mapping logic here).
- Edge Functions: `supabase/functions/reviews/index.ts` (new), `supabase/functions/returns/index.ts` (replaces the Phase 1 stub).
- Schema: `supabase/migrations/0009_returns.sql` (Phase 1) extended by `0024_reviews_and_returns_workflow.sql` (Phase 14) — new `product_reviews`/`product_review_images`/`return_item_evidence`, new columns on `returns`/`return_items`, `review-images` (public) and `return-evidence` (private) storage buckets.

See `docs/phase-14-completion-report.md` for the full implementation writeup, known limitations, and next-phase readiness.
