-- supabase/seed.sql
-- DEV-ONLY seed data. NOT applied by `supabase db push` — only by
-- `supabase db reset` / `supabase start` in local development, per Supabase
-- CLI convention. Safe to re-run (idempotent upserts via ON CONFLICT).
-- Contains no real production data, no real customers, no real orders.

insert into brands (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'SADOER', 'sadoer', 'published', 1),
  ('00000000-0000-0000-0000-000000000002', 'Hero Cosmetics', 'hero-cosmetics', 'published', 2),
  ('00000000-0000-0000-0000-000000000003', 'SOME BY MI', 'some-by-mi', 'published', 3)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into categories (id, name, slug, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', 'Masks', 'masks', 'published', 1),
  ('00000000-0000-0000-0000-000000000102', 'Acne Care', 'acne-care', 'published', 2),
  ('00000000-0000-0000-0000-000000000103', 'Toners', 'toners', 'published', 3)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into products (id, brand_id, name, slug, short_description, status, is_featured, published_at)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'SADOER Collagen Anti-Aging Facial Mask',
    'sadoer-collagen-anti-aging-facial-mask',
    '25g collagen firming sheet mask',
    'published', true, timezone('utc', now())
  )
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status;

insert into product_variants (id, product_id, sku, title, price, compare_at_price, status)
values
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    'ABC-SADOER-SD80885',
    '25g',
    12900,   -- Rs. 129.00 in minor units (paisa)
    19900,   -- Rs. 199.00 in minor units (paisa)
    'published'
  )
on conflict (id) do update set price = excluded.price, compare_at_price = excluded.compare_at_price;

insert into product_categories (product_id, category_id)
values ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101')
on conflict do nothing;
