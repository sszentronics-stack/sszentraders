-- Live storefront catalog: the three products on the shop.
-- Safe to re-run.

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

insert into categories (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', 'Masks', 'masks', 'published', 1),
  ('00000000-0000-0000-0000-000000000102', 'Acne Care', 'acne-care', 'published', 2),
  ('00000000-0000-0000-0000-000000000103', 'Toners', 'toners', 'published', 3)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

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
    '{"badge":"new"}'::jsonb
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
    '{"badge":"bestseller"}'::jsonb
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
    '{"badge":"sale"}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  short_description = excluded.short_description,
  description = excluded.description,
  status = excluded.status,
  is_featured = excluded.is_featured,
  published_at = excluded.published_at;

insert into product_variants (
  id, product_id, sku, title, price, compare_at_price, status
)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'ABC-SADOER-SD80885', '25g', 12900, 19900, 'published'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', 'ABC-HERO-MP-INV39', '39 patches', 440000, 550000, 'published'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000203', 'ABC-SBM-TONER-150', '150ml', 790000, 1199900, 'published')
on conflict (id) do update set
  sku = excluded.sku,
  title = excluded.title,
  price = excluded.price,
  compare_at_price = excluded.compare_at_price,
  status = excluded.status;

insert into product_categories (product_id, category_id)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000103')
on conflict do nothing;

insert into inventory_cache (variant_id, quantity_on_hand, quantity_available, quantity_reserved, last_synced_at, sync_status)
values
  ('00000000-0000-0000-0000-000000000301', 120, 110, 10, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000302', 85, 80, 5, timezone('utc', now()), 'succeeded'),
  ('00000000-0000-0000-0000-000000000303', 64, 60, 4, timezone('utc', now()), 'succeeded')
on conflict (variant_id) do update set
  quantity_on_hand = excluded.quantity_on_hand,
  quantity_available = excluded.quantity_available,
  quantity_reserved = excluded.quantity_reserved,
  last_synced_at = excluded.last_synced_at,
  sync_status = excluded.sync_status;
