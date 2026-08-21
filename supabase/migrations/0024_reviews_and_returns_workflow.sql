-- 0021_reviews_and_returns_workflow.sql
-- Phase 14: Reviews, Returns & Customer Service.
--
-- Numbering note: 0001-0020 were all taken at the time this migration was
-- written, and 0021 was verified free in this session's worktree. Phase 9
-- (ERP-Controlled Inventory), running in parallel, also landed a migration
-- as 0021_inventory_cache_public_read.sql. Both files are additive and
-- touch fully disjoint tables (this file never touches inventory_cache or
-- any products stock column), so applying them in either order is safe —
-- same resolution Phase 8 documented for the earlier 0019 collision. See
-- supabase/migrations/README.md for the full note.
--
-- Adds:
--   1. Reviews: product_reviews + product_review_images (new schema —
--      Phase 1 deferred this entirely to Phase 14, see backend/services/
--      reviews/README.md).
--   2. Returns: extends the EXISTING returns/return_items/return_events
--      tables (0009_returns.sql) with the columns this phase's workflow
--      needs, rather than duplicating them — plus a new return_item_evidence
--      table for photo evidence.
--   3. Storage buckets: review-images (public read, customer-submitted
--      evidence on a published review) and return-evidence (private —
--      never public, read only via a service-role-issued signed URL).

-- ===========================================================================
-- 1. Reviews
-- ===========================================================================

create type review_status as enum ('pending', 'published', 'rejected');

create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  -- The purchased line item this review is FOR — this is both "which product
  -- variant did they actually buy" and the verified-purchase proof itself.
  -- The unique constraint below is the duplicate/unverified-review-abuse
  -- guard: at most one review can ever exist per purchased line item,
  -- enforced at the database level (not just app-layer discipline), same
  -- pattern as 0019's shipment/idempotency-key uniqueness.
  order_item_id uuid not null references order_items (id) on delete cascade,
  rating smallint not null,
  title text,
  body text,
  status review_status not null default 'pending',
  moderation_note text,
  moderated_by uuid references profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_product_reviews_rating_range check (rating between 1 and 5),
  constraint uq_product_reviews_order_item unique (order_item_id)
);

create trigger trg_product_reviews_updated_at
  before update on product_reviews
  for each row execute function set_updated_at();

create index idx_product_reviews_product_id on product_reviews (product_id);
create index idx_product_reviews_customer_id on product_reviews (customer_id);
create index idx_product_reviews_status on product_reviews (status);

comment on table product_reviews is 'Verified-purchase product reviews. order_item_id both identifies what was actually bought and doubles as the one-review-per-purchase proof/duplicate guard. See backend/services/reviews/reviews.service.ts for the eligibility check this alone does not fully express (delivered order state).';
comment on column product_reviews.order_item_id is 'The specific purchased line item being reviewed. UNIQUE — enforces "at most one review per purchased item," the core anti-abuse guarantee this table provides at the database level.';

create table product_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references product_reviews (id) on delete cascade,
  storage_path text not null,          -- path within the `review-images` storage bucket
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_product_review_images_review_id on product_review_images (review_id);

-- ===========================================================================
-- 2. Returns — extend 0009_returns.sql's schema, don't duplicate
-- ===========================================================================

alter table returns
  add column if not exists resolution text,
  add column if not exists inspection_outcome text,
  add column if not exists inspection_notes text,
  add column if not exists refund_method text,
  add column if not exists refund_payment_id uuid references payments (id) on delete set null,
  add column if not exists ledgix_credit_note_id text,
  add column if not exists ledgix_credit_note_number text;

alter table returns
  add constraint chk_returns_resolution check (resolution is null or resolution in ('refund', 'replacement'));
alter table returns
  add constraint chk_returns_refund_method check (refund_method is null or refund_method in ('easypaisa', 'manual'));

comment on column returns.resolution is 'Post-inspection decision: refund or replacement. Null until the return reaches "received" and an admin records the inspection outcome (backend/services/reviews/returns.service.ts''s recordInspectionOutcome).';
comment on column returns.inspection_outcome is 'Free-text summary of what the received item looked like on inspection (e.g. "confirmed damaged as described", "item does not match description, rejecting"). Paired with resolution.';
comment on column returns.refund_method is 'How refund_amount was (or will be) returned to the customer: easypaisa (via the real EasypaisaProvider.refundPayment once configured) or manual (COD/bank transfer handled outside the app). Set only when resolution = refund. See backend/services/reviews/refund.service.ts.';
comment on column returns.refund_payment_id is 'The original order payment this refund was issued against, when one exists (COD orders may have no payments row to refund against — see refund.service.ts).';
comment on column returns.ledgix_credit_note_id is 'LedGix ERP credit note reference for this return''s refund/replacement reversal, stamped only after a real ErpProvider.recordCreditNote() call actually succeeds — never fabricated. Mirrors local_financial_transactions.ledgix_document_id''s "only ever written on genuine success" rule from Phase 8.';

alter table return_items
  add column if not exists reason_code text;

alter table return_items
  add constraint chk_return_items_reason_code check (
    reason_code is null or reason_code in (
      'damaged_in_transit', 'wrong_item_received', 'not_as_described',
      'defective_quality', 'changed_mind', 'size_fit_issue', 'other'
    )
  );

comment on column return_items.reason_code is 'Structured reason code driving the return-policy eligibility engine (backend/lib/returns) and whether photo evidence is required. return_items.reason (pre-existing, free text) remains the customer''s own notes.';

create table return_item_evidence (
  id uuid primary key default gen_random_uuid(),
  return_item_id uuid not null references return_items (id) on delete cascade,
  storage_path text not null,          -- path within the private `return-evidence` storage bucket
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_return_item_evidence_return_item_id on return_item_evidence (return_item_id);

comment on table return_item_evidence is 'Customer-submitted photo evidence for a return line item — required for some reason codes (see backend/lib/returns'' REASON_CODES_REQUIRING_EVIDENCE). Stored in the PRIVATE return-evidence bucket; read access is only ever via a service-role-issued short-lived signed URL, never a public bucket read.';

-- ===========================================================================
-- 3. Storage buckets
-- ===========================================================================
-- File paths use stable IDs only, same convention as 0015_storage_buckets.sql:
--   review-images/{review_id}/{image_id}.{ext}
--   return-evidence/{return_item_id}/{evidence_id}.{ext}

insert into storage.buckets (id, name, public)
values
  ('review-images', 'review-images', true),
  ('return-evidence', 'return-evidence', false)
on conflict (id) do nothing;

create policy storage_review_images_public_read on storage.objects
  for select using (bucket_id = 'review-images');
-- Writes go through a service-role-issued signed upload URL (see
-- backend/services/reviews/reviews.service.ts's createReviewImageUploadUrl,
-- same shape as Phase 3's createProductImageUploadUrl) — the policies below
-- are defense-in-depth for the admin/service-role path, not the actual
-- upload mechanism (a valid signed-upload token authorizes independently of
-- these policies).
create policy storage_review_images_admin_write on storage.objects
  for insert with check (bucket_id = 'review-images' and is_admin());
create policy storage_review_images_admin_delete on storage.objects
  for delete using (bucket_id = 'review-images' and is_admin());

-- return-evidence is PRIVATE: deliberately no public-read policy, and no
-- authenticated-role policy either. Every read/write goes through the
-- returns Edge Function's service-role client with an explicit
-- ownership/admin check, same trust model as shipments' request_payload/
-- provider_payload never being exposed through a public bucket.
create policy storage_return_evidence_admin_all on storage.objects
  for all using (bucket_id = 'return-evidence' and is_admin())
  with check (bucket_id = 'return-evidence' and is_admin());

-- ===========================================================================
-- 4. Row Level Security
-- ===========================================================================

alter table product_reviews enable row level security;
alter table product_review_images enable row level security;
alter table return_item_evidence enable row level security;

-- Public storefront read of published reviews — the whole point of this
-- table's existence. No insert/update policy for authenticated customers:
-- writes require the eligibility check (verified delivered purchase, one
-- review per order item) that only the reviews Edge Function's service-role
-- client performs — same "self-read only, service-role writes" model Phase 1
-- already established for `returns` itself.
create policy product_reviews_public_read on product_reviews
  for select using (status = 'published');

create policy product_reviews_self_read on product_reviews
  for select using (customer_id in (select c.id from customers c where c.profile_id = current_profile_id()));

create policy product_reviews_admin_all on product_reviews
  for all using (is_admin()) with check (is_admin());

create policy product_review_images_public_read on product_review_images
  for select using (
    exists (select 1 from product_reviews r where r.id = product_review_images.review_id and r.status = 'published')
  );

create policy product_review_images_self_read on product_review_images
  for select using (
    exists (
      select 1 from product_reviews r
      join customers c on c.id = r.customer_id
      where r.id = product_review_images.review_id and c.profile_id = current_profile_id()
    )
  );

create policy product_review_images_admin_all on product_review_images
  for all using (is_admin()) with check (is_admin());

-- return_item_evidence ROW metadata (not the storage bytes themselves,
-- which stay behind the private bucket + signed URL above) is self-readable
-- by the owning customer, matching returns_self_read's existing shape.
create policy return_item_evidence_self_read on return_item_evidence
  for select using (
    exists (
      select 1 from return_items ri
      join returns rt on rt.id = ri.return_id
      join customers c on c.id = rt.customer_id
      where ri.id = return_item_evidence.return_item_id and c.profile_id = current_profile_id()
    )
  );

create policy return_item_evidence_admin_all on return_item_evidence
  for all using (is_admin()) with check (is_admin());
