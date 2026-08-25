-- Aura Beauty Care — DUMMY / DEV DATA
-- Run in SQL Editor (after migrations):
-- https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new
--
-- Safe to re-run (upserts / on conflict). No real customers.

-- =============================================================================
-- Brands
-- =============================================================================
insert into brands (id, name, slug, status, sort_order, description)
values
  ('00000000-0000-0000-0000-000000000001', 'SADOER', 'sadoer', 'published', 1, 'Collagen-focused skincare'),
  ('00000000-0000-0000-0000-000000000002', 'Hero Cosmetics', 'hero-cosmetics', 'published', 2, 'Mighty Patch acne care'),
  ('00000000-0000-0000-0000-000000000003', 'SOME BY MI', 'some-by-mi', 'published', 3, 'Korean clinical skincare')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  sort_order = excluded.sort_order;

-- =============================================================================
-- Categories
-- =============================================================================
insert into categories (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', 'Masks', 'masks', 'published', 1),
  ('00000000-0000-0000-0000-000000000102', 'Acne Care', 'acne-care', 'published', 2),
  ('00000000-0000-0000-0000-000000000103', 'Toners', 'toners', 'published', 3),
  ('00000000-0000-0000-0000-000000000104', 'Serums', 'serums', 'published', 4),
  ('00000000-0000-0000-0000-000000000105', 'Cleansers', 'cleansers', 'published', 5)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

-- =============================================================================
-- Products + variants (prices in PKR paisa: Rs.129 = 12900)
-- =============================================================================
insert into products (
  id, brand_id, name, slug, short_description, description, product_type,
  status, is_featured, published_at, attributes
)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'SADOER Collagen Anti-Aging Facial Mask',
    'sadoer-collagen-anti-aging-facial-mask',
    '25g collagen firming sheet mask',
    'Replenish collagen and restore youthful skin with a thin collagen sheet mask.',
    'Facial Mask',
    'published', true, timezone('utc', now()),
    '{"badge":"new","rating":4.8,"reviewCount":42}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000002',
    'Hero Mighty Patch Invisible+',
    'hero-mighty-patch-invisible-plus',
    '39 hydrocolloid patches for daytime wear',
    'Award-winning hydrocolloid pimple patches in a barely-there Invisible+ formula.',
    'Spot Patches',
    'published', true, timezone('utc', now()),
    '{"badge":"bestseller","rating":4.9,"reviewCount":128}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000003',
    'SOME BY MI AHA BHA PHA 30 Days Miracle Toner',
    'some-by-mi-aha-bha-pha-30-days-miracle-toner',
    '150 ml clinical solution with tea tree & niacinamide',
    'Zero-step Korean toner with AHA, BHA, and PHA for clearer-looking skin.',
    'Face Toner',
    'published', true, timezone('utc', now()),
    '{"badge":"sale","rating":4.8,"reviewCount":96}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000001',
    'SADOER Collagen Cleansing Foam',
    'sadoer-collagen-cleansing-foam',
    'Gentle collagen face wash 100ml',
    'Creamy cleansing foam that lifts dirt without stripping moisture.',
    'Cleanser',
    'published', false, timezone('utc', now()),
    '{"badge":null,"rating":4.5,"reviewCount":18}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000003',
    'SOME BY MI Miracle Serum',
    'some-by-mi-miracle-serum',
    '50 ml clarifying serum',
    'Lightweight serum for uneven texture and dullness.',
    'Serum',
    'published', true, timezone('utc', now()),
    '{"badge":"new","rating":4.7,"reviewCount":54}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000206',
    '00000000-0000-0000-0000-000000000002',
    'Hero Mighty Patch Original',
    'hero-mighty-patch-original',
    '36 overnight hydrocolloid patches',
    'The classic overnight Mighty Patch for bigger blemishes.',
    'Spot Patches',
    'published', false, timezone('utc', now()),
    '{"badge":null,"rating":4.8,"reviewCount":210}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  short_description = excluded.short_description,
  description = excluded.description,
  status = excluded.status,
  is_featured = excluded.is_featured,
  attributes = excluded.attributes,
  published_at = excluded.published_at;

insert into product_variants (
  id, product_id, sku, title, price, compare_at_price, cost_price, status
)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'ABC-SADOER-SD80885', '25g', 12900, 19900, 7000, 'published'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', 'ABC-HERO-MP-INV39', '39 patches', 440000, 550000, 280000, 'published'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000203', 'ABC-SBM-TONER-150', '150ml', 790000, 1199900, 450000, 'published'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000204', 'ABC-SADOER-CLEANSE-100', '100ml', 189000, 249000, 95000, 'published'),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000205', 'ABC-SBM-SERUM-50', '50ml', 890000, 1290000, 510000, 'published'),
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000206', 'ABC-HERO-MP-ORIG36', '36 patches', 390000, 480000, 240000, 'published')
on conflict (id) do update set
  price = excluded.price,
  compare_at_price = excluded.compare_at_price,
  status = excluded.status;

insert into product_categories (product_id, category_id)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000105'),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000102')
on conflict do nothing;

-- Inventory cache (dummy stock)
insert into inventory_cache (variant_id, quantity_on_hand, quantity_available, quantity_reserved, last_synced_at, sync_status)
values
  ('00000000-0000-0000-0000-000000000301', 120, 110, 10, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000302', 85, 80, 5, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000303', 64, 60, 4, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000304', 40, 40, 0, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000305', 28, 25, 3, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000306', 15, 12, 3, timezone('utc', now()), 'succeeded')
on conflict (variant_id) do update set
  quantity_on_hand = excluded.quantity_on_hand,
  quantity_available = excluded.quantity_available,
  quantity_reserved = excluded.quantity_reserved,
  last_synced_at = excluded.last_synced_at,
  sync_status = excluded.sync_status;

-- =============================================================================
-- Dummy customers
-- =============================================================================
insert into customers (
  id, customer_number, first_name, last_name, email, phone, marketing_opt_in, status
)
values
  ('00000000-0000-0000-0000-000000000401', 'CUST-1001', 'Ayesha', 'Khan', 'ayesha.demo@example.com', '03001234567', true, 'active'),
  ('00000000-0000-0000-0000-000000000402', 'CUST-1002', 'Bilal', 'Ahmed', 'bilal.demo@example.com', '03007654321', false, 'active'),
  ('00000000-0000-0000-0000-000000000403', 'CUST-1003', 'Sara', 'Malik', 'sara.demo@example.com', '03219876543', true, 'active'),
  ('00000000-0000-0000-0000-000000000404', 'CUST-1004', 'Hassan', 'Raza', 'hassan.demo@example.com', '03331231231', false, 'active'),
  ('00000000-0000-0000-0000-000000000405', 'CUST-1005', 'Fatima', 'Noor', 'fatima.demo@example.com', '03451112233', true, 'active')
on conflict (id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone;

-- =============================================================================
-- Dummy orders (today + recent days) for admin dashboard
-- =============================================================================
insert into orders (
  id, order_number, customer_id, email, phone, currency,
  subtotal, discount_total, shipping_total, tax_total, grand_total,
  order_status, payment_status, fulfillment_status, payment_method, source, placed_at
)
values
  (
    '00000000-0000-0000-0000-000000000501', 'ABC-2001',
    '00000000-0000-0000-0000-000000000401', 'ayesha.demo@example.com', '03001234567', 'PKR',
    452900, 0, 25000, 0, 477900,
    'confirmed', 'paid', 'unfulfilled', 'easypaisa', 'web',
    timezone('utc', now()) - interval '2 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000502', 'ABC-2002',
    '00000000-0000-0000-0000-000000000402', 'bilal.demo@example.com', '03007654321', 'PKR',
    12900, 0, 25000, 0, 37900,
    'pending', 'pending', 'unfulfilled', 'cod', 'web',
    timezone('utc', now()) - interval '1 hour'
  ),
  (
    '00000000-0000-0000-0000-000000000503', 'ABC-2003',
    '00000000-0000-0000-0000-000000000403', 'sara.demo@example.com', '03219876543', 'PKR',
    890000, 50000, 0, 0, 840000,
    'confirmed', 'paid', 'partially_fulfilled', 'easypaisa', 'web',
    timezone('utc', now()) - interval '5 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000504', 'ABC-2004',
    '00000000-0000-0000-0000-000000000404', 'hassan.demo@example.com', '03331231231', 'PKR',
    790000, 0, 25000, 0, 815000,
    'pending', 'pending', 'unfulfilled', 'cod', 'whatsapp',
    timezone('utc', now()) - interval '30 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000505', 'ABC-2005',
    '00000000-0000-0000-0000-000000000405', 'fatima.demo@example.com', '03451112233', 'PKR',
    440000, 0, 25000, 0, 465000,
    'shipped', 'paid', 'fulfilled', 'easypaisa', 'web',
    timezone('utc', now()) - interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000000506', 'ABC-2006',
    '00000000-0000-0000-0000-000000000401', 'ayesha.demo@example.com', '03001234567', 'PKR',
    579000, 0, 25000, 0, 604000,
    'delivered', 'paid', 'fulfilled', 'easypaisa', 'web',
    timezone('utc', now()) - interval '2 days'
  ),
  (
    '00000000-0000-0000-0000-000000000507', 'ABC-2007',
    '00000000-0000-0000-0000-000000000402', 'bilal.demo@example.com', '03007654321', 'PKR',
    390000, 0, 25000, 0, 415000,
    'confirmed', 'paid', 'unfulfilled', 'cod', 'web',
    timezone('utc', now()) - interval '3 days'
  ),
  (
    '00000000-0000-0000-0000-000000000508', 'ABC-2008',
    '00000000-0000-0000-0000-000000000403', 'sara.demo@example.com', '03219876543', 'PKR',
    1019000, 100000, 0, 0, 919000,
    'cancelled', 'refunded', 'unfulfilled', 'easypaisa', 'web',
    timezone('utc', now()) - interval '4 days'
  )
on conflict (id) do update set
  order_status = excluded.order_status,
  payment_status = excluded.payment_status,
  fulfillment_status = excluded.fulfillment_status,
  grand_total = excluded.grand_total,
  placed_at = excluded.placed_at;

insert into order_items (
  id, order_id, product_id, variant_id, sku, product_name, variant_name,
  quantity, unit_price, original_price, discount_amount, line_total
)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'ABC-SADOER-SD80885', 'SADOER Collagen Anti-Aging Facial Mask', '25g', 1, 12900, 19900, 0, 12900),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000302', 'ABC-HERO-MP-INV39', 'Hero Mighty Patch Invisible+', '39 patches', 1, 440000, 550000, 0, 440000),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'ABC-SADOER-SD80885', 'SADOER Collagen Anti-Aging Facial Mask', '25g', 1, 12900, 19900, 0, 12900),
  ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000305', 'ABC-SBM-SERUM-50', 'SOME BY MI Miracle Serum', '50ml', 1, 890000, 1290000, 50000, 840000),
  ('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000303', 'ABC-SBM-TONER-150', 'SOME BY MI AHA BHA PHA 30 Days Miracle Toner', '150ml', 1, 790000, 1199900, 0, 790000),
  ('00000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000302', 'ABC-HERO-MP-INV39', 'Hero Mighty Patch Invisible+', '39 patches', 1, 440000, 550000, 0, 440000),
  ('00000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000304', 'ABC-SADOER-CLEANSE-100', 'SADOER Collagen Cleansing Foam', '100ml', 1, 189000, 249000, 0, 189000),
  ('00000000-0000-0000-0000-000000000608', '00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000306', 'ABC-HERO-MP-ORIG36', 'Hero Mighty Patch Original', '36 patches', 1, 390000, 480000, 0, 390000),
  ('00000000-0000-0000-0000-000000000609', '00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000306', 'ABC-HERO-MP-ORIG36', 'Hero Mighty Patch Original', '36 patches', 1, 390000, 480000, 0, 390000),
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000303', 'ABC-SBM-TONER-150', 'SOME BY MI AHA BHA PHA 30 Days Miracle Toner', '150ml', 1, 790000, 1199900, 0, 790000),
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'ABC-SADOER-SD80885', 'SADOER Collagen Anti-Aging Facial Mask', '25g', 1, 12900, 19900, 0, 12900)
on conflict (id) do nothing;

-- Quick counts
select 'brands' as entity, count(*)::text as count from brands
union all select 'categories', count(*)::text from categories
union all select 'products', count(*)::text from products
union all select 'variants', count(*)::text from product_variants
union all select 'customers', count(*)::text from customers
union all select 'orders', count(*)::text from orders
union all select 'order_items', count(*)::text from order_items;
