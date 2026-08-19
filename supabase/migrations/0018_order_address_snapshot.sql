-- 0018_order_address_snapshot.sql
-- Phase 6 (Checkout & Order Management).
--
-- orders (0006_orders.sql) already snapshots contact info (email/phone) but
-- has no shipping address columns — checkout needs to persist an immutable
-- copy of the delivery address at the moment the order was placed, exactly
-- like order_items already snapshots product name/price ("never rely on
-- joining current data" — the same rule applies to the customer's address
-- book, which they can keep editing after the order ships).
--
-- Deliberately snapshot columns directly on `orders` (mirroring
-- order_items' snapshot philosophy) rather than a separate order_addresses
-- table — a single 1:1 shipping address per order needs no join, and this
-- keeps "read an order" a single-table read for the common case.

alter table orders add column shipping_recipient_name text;
alter table orders add column shipping_phone text;
alter table orders add column shipping_address_line_1 text;
alter table orders add column shipping_address_line_2 text;
alter table orders add column shipping_city text;
alter table orders add column shipping_province text;
alter table orders add column shipping_postal_code text;
alter table orders add column shipping_country text;
alter table orders add column delivery_method text; -- e.g. 'standard' | 'express' — free-form until Phase 11 wires real courier service levels
alter table orders add column customer_address_id uuid references customer_addresses (id) on delete set null; -- convenience back-reference only; the columns above remain the source of truth if the address is later edited/deleted

comment on column orders.shipping_address_line_1 is 'Immutable snapshot taken at checkout — never re-read from customer_addresses, which the customer may edit/delete after placing this order.';
comment on column orders.customer_address_id is 'Which saved address (if any) this snapshot came from, for admin convenience only. Nullable: guest checkout or a one-off address never touches customer_addresses at all.';

-- cart_events (0017_cart_wishlist_recently_viewed.sql) didn't anticipate a
-- cart being consumed by a real order yet — add that event type now rather
-- than overloading 'merged' (which means something different: a guest
-- cart's lines being merged into an authenticated cart) for it.
alter table cart_events drop constraint cart_events_event_type_check;
alter table cart_events add constraint cart_events_event_type_check
  check (event_type in ('created', 'item_added', 'item_updated', 'item_removed', 'cleared', 'merged', 'abandoned', 'recovered', 'converted'));
