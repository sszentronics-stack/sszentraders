-- 0022_promotions_engine.sql
-- Phase 13: Promotions, Loyalty & Customer Intelligence.
--
-- Extends the Phase 1 schema-only foundation (0010_promotions.sql:
-- campaigns/promotions/coupons/discounts) with the narrow set of columns
-- and tables the real discount/loyalty engine needs:
--   - promotions gains eligibility fields (min spend, first-order-only,
--     product/category/collection scope) so the server-side rule engine
--     (backend/lib/promotions) has something real to evaluate.
--   - coupon_redemptions is the audit trail of which customer used which
--     coupon on which order, and is also how a cancelled/refunded order's
--     coupon usage gets safely released (see the trigger below).
--   - loyalty_ledger_entries is the append-only points ledger (earn/
--     redeem/reversal) — balance is always SUM(points), never a mutable
--     column, per the phase spec.
--
-- Concurrency: the "don't let two concurrent checkouts both claim the last
-- use of a limited coupon" requirement is satisfied by
-- backend/services/promotions/promotions.service.ts's claimCouponUsage()
-- doing a single conditional UPDATE
-- (`SET times_used = times_used + 1 WHERE ... times_used < usage_limit`)
-- rather than a read-then-write — that one UPDATE statement is atomic in
-- Postgres regardless of concurrent callers, no explicit locking needed.

-- ---------------------------------------------------------------------------
-- promotions: eligibility fields
-- ---------------------------------------------------------------------------

alter table promotions
  add column min_spend bigint,
  add column first_order_only boolean not null default false,
  add column applies_to text not null default 'all',
  add column scope_id uuid;

alter table promotions
  add constraint chk_promotions_min_spend_nonnegative check (min_spend is null or min_spend >= 0);

alter table promotions
  add constraint chk_promotions_applies_to check (applies_to in ('all', 'category', 'collection', 'product'));

alter table promotions
  add constraint chk_promotions_scope_id_matches_applies_to
    check ((applies_to = 'all') = (scope_id is null));

comment on column promotions.applies_to is 'Discount scope: ''all'' applies to the whole cart subtotal; ''category''/''collection''/''product'' apply only to matching cart line items (scope_id references categories.id / collections.id / products.id respectively — no FK because it is polymorphic; validated in backend/lib/promotions instead).';
comment on column promotions.first_order_only is 'When true, only customers with zero prior orders are eligible (see backend/services/promotions/segmentation.service.ts::isFirstOrderCustomer).';

-- ---------------------------------------------------------------------------
-- coupon_redemptions: audit trail + per-customer usage counting + the
-- release marker cancellation/refund reversal uses.
-- ---------------------------------------------------------------------------

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  amount bigint not null,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_coupon_redemptions_amount_nonnegative check (amount >= 0),
  constraint uq_coupon_redemptions_order unique (coupon_id, order_id)
);

create index idx_coupon_redemptions_coupon_id on coupon_redemptions (coupon_id);
create index idx_coupon_redemptions_customer_id on coupon_redemptions (customer_id);
create index idx_coupon_redemptions_order_id on coupon_redemptions (order_id);

comment on column coupon_redemptions.released_at is 'Set once (by the order-status trigger below) when the owning order is cancelled/refunded and this redemption''s usage-count claim is given back — makes the release idempotent.';

-- ---------------------------------------------------------------------------
-- loyalty_ledger_entries: append-only points ledger. Balance for a customer
-- is always `SUM(points) WHERE customer_id = ...` — never a mutable column.
-- ---------------------------------------------------------------------------

create table loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  order_id uuid references orders (id) on delete set null,
  entry_type text not null,
  points bigint not null,
  description text,
  idempotency_key text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_loyalty_entry_type check (entry_type in ('earn', 'redeem', 'reversal'))
);

create index idx_loyalty_ledger_customer_id on loyalty_ledger_entries (customer_id);
create index idx_loyalty_ledger_order_id on loyalty_ledger_entries (order_id);

comment on table loyalty_ledger_entries is 'Append-only points event log. earn: positive points credited (order delivered). redeem: negative points spent (checkout-time redemption). reversal: an offsetting entry (opposite sign of what it undoes) for a cancelled/refunded order. idempotency_key prevents the order-status trigger (or a retried service call) from ever double-crediting/double-reversing the same event.';
comment on column loyalty_ledger_entries.points is 'Signed. earn > 0, redeem < 0, reversal is the negation of the entry it reverses. Balance = SUM(points).';

alter table coupon_redemptions enable row level security;
alter table loyalty_ledger_entries enable row level security;

create policy coupon_redemptions_admin_all on coupon_redemptions for all using (is_admin()) with check (is_admin());

create policy loyalty_ledger_self_read on loyalty_ledger_entries
  for select using (
    customer_id in (select c.id from customers c where c.profile_id = current_profile_id())
  );
create policy loyalty_ledger_admin_all on loyalty_ledger_entries for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Order-lifecycle triggers: loyalty earn on delivery, and reversal of
-- redeemed points / released coupon usage on cancellation or refund.
--
-- This is deliberately implemented as a DB trigger rather than application
-- code called from a specific service function, because order_status can be
-- transitioned from more than one call site (customer self-cancel in
-- backend/services/orders/orders.service.ts, the returns/refund flow in
-- backend/services/reviews/returns.service.ts, and eventually an admin
-- status-change endpoint from Phase 12) — a trigger guarantees the loyalty
-- consequence fires exactly once no matter which code path changes the
-- status, without Phase 13 needing to modify any of those other phases'
-- service files.
--
-- Earn rate: 1 point per 100 minor units (i.e. 1 point per Rs. 1) of
-- grand_total, floored. Documented once here and mirrored (never
-- re-derived independently) by backend/lib/loyalty's EARN_RATE_PER_MINOR_UNIT
-- constant, which the frontend/service layer uses for previews — if this
-- rate ever changes, both places must change together.
-- ---------------------------------------------------------------------------

create or replace function fn_promotions_on_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Earn: order reaches 'delivered'.
  if NEW.order_status = 'delivered' and (OLD.order_status is distinct from NEW.order_status) and NEW.customer_id is not null then
    insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
    values (
      NEW.customer_id,
      NEW.id,
      'earn',
      floor(NEW.grand_total / 100.0),
      'Points earned for order ' || NEW.order_number,
      'loyalty:earn:' || NEW.id
    )
    on conflict (idempotency_key) do nothing;
  end if;

  -- Reversal: order cancelled (only reachable pre-delivery, so only
  -- redeemed points and coupon usage can be outstanding — no earn to
  -- reverse) or refunded (reachable only post-delivery via the returns
  -- flow, so both earned and redeemed points may need reversing).
  if NEW.order_status in ('cancelled', 'refunded') and (OLD.order_status is distinct from NEW.order_status) then
    if NEW.order_status = 'refunded' then
      insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
      select l.customer_id, NEW.id, 'reversal', -l.points, 'Reversal of earned points for refunded order ' || NEW.order_number, 'loyalty:reversal:earn:' || NEW.id
      from loyalty_ledger_entries l
      where l.order_id = NEW.id and l.entry_type = 'earn'
      on conflict (idempotency_key) do nothing;
    end if;

    insert into loyalty_ledger_entries (customer_id, order_id, entry_type, points, description, idempotency_key)
    select l.customer_id, NEW.id, 'reversal', -l.points, 'Reversal of redeemed points for ' || NEW.order_status || ' order ' || NEW.order_number, 'loyalty:reversal:redeem:' || NEW.id
    from loyalty_ledger_entries l
    where l.order_id = NEW.id and l.entry_type = 'redeem'
    on conflict (idempotency_key) do nothing;

    -- Release any coupon usage claimed for this order (give the usage slot
    -- back). released_at guards against double-release on a repeated
    -- trigger fire, keeping the operation idempotent regardless.
    update coupons c
    set times_used = greatest(c.times_used - 1, 0)
    from coupon_redemptions r
    where r.order_id = NEW.id and r.coupon_id = c.id and r.released_at is null;

    update coupon_redemptions
    set released_at = timezone('utc', now())
    where order_id = NEW.id and released_at is null;
  end if;

  return NEW;
end;
$$;

create trigger trg_promotions_on_order_status_change
  after update of order_status on orders
  for each row
  execute function fn_promotions_on_order_status_change();

-- ---------------------------------------------------------------------------
-- claim_coupon_usage / release_coupon_usage: the atomic primitives
-- backend/services/promotions/promotions.service.ts calls via db.rpc(...).
-- Each is a single UPDATE ... WHERE statement, so Postgres serializes
-- concurrent callers for the same coupon row — no read-then-write gap, no
-- explicit application-level locking needed. claim_coupon_usage returns
-- false (rather than throwing) when the limit was already reached,
-- including by a request that won a race a moment earlier, so the caller
-- can turn that into a clean "coupon no longer available" error.
-- ---------------------------------------------------------------------------

create or replace function claim_coupon_usage(p_coupon_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update coupons
  set times_used = times_used + 1
  where id = p_coupon_id
    and status = 'active'
    and (usage_limit is null or times_used < usage_limit)
  returning true;
$$;

create or replace function release_coupon_usage(p_coupon_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update coupons
  set times_used = greatest(times_used - 1, 0)
  where id = p_coupon_id;
$$;

-- Deny-by-default (matching 0014_row_level_security.sql's stated policy):
-- only the service role (Edge Functions) may call these — never anon/
-- authenticated directly, since they bypass the usual RLS-scoped path.
revoke execute on function claim_coupon_usage(uuid) from public;
revoke execute on function release_coupon_usage(uuid) from public;
grant execute on function claim_coupon_usage(uuid) to service_role;
grant execute on function release_coupon_usage(uuid) to service_role;
