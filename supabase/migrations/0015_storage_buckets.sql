-- 0015_storage_buckets.sql
-- Storage foundation: product-images, brand-assets, category-assets.
-- Public read (for published/live assets), restricted write (service-role /
-- admin only). Existing static images under public/products/** are NOT
-- migrated in Phase 1 — see docs/phase-1-backend-foundation.md "Storage
-- strategy" for the future migration path.
--
-- File paths must use stable IDs, never product names, e.g.:
--   product-images/{product_id}/{variant_id-or-'default'}/{image_id}.webp
--   brand-assets/{brand_id}/{asset_id}.webp
--   category-assets/{category_id}/{asset_id}.webp

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('brand-assets', 'brand-assets', true),
  ('category-assets', 'category-assets', true)
on conflict (id) do nothing;

-- Public read for all three buckets.
create policy storage_product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');
create policy storage_brand_assets_public_read on storage.objects
  for select using (bucket_id = 'brand-assets');
create policy storage_category_assets_public_read on storage.objects
  for select using (bucket_id = 'category-assets');

-- Writes restricted to admins (authenticated users with profiles.is_admin)
-- or the service role (Edge Functions), which bypasses RLS entirely.
create policy storage_product_images_admin_write on storage.objects
  for insert with check (bucket_id = 'product-images' and is_admin());
create policy storage_product_images_admin_update on storage.objects
  for update using (bucket_id = 'product-images' and is_admin()) with check (bucket_id = 'product-images' and is_admin());
create policy storage_product_images_admin_delete on storage.objects
  for delete using (bucket_id = 'product-images' and is_admin());

create policy storage_brand_assets_admin_write on storage.objects
  for insert with check (bucket_id = 'brand-assets' and is_admin());
create policy storage_brand_assets_admin_update on storage.objects
  for update using (bucket_id = 'brand-assets' and is_admin()) with check (bucket_id = 'brand-assets' and is_admin());
create policy storage_brand_assets_admin_delete on storage.objects
  for delete using (bucket_id = 'brand-assets' and is_admin());

create policy storage_category_assets_admin_write on storage.objects
  for insert with check (bucket_id = 'category-assets' and is_admin());
create policy storage_category_assets_admin_update on storage.objects
  for update using (bucket_id = 'category-assets' and is_admin()) with check (bucket_id = 'category-assets' and is_admin());
create policy storage_category_assets_admin_delete on storage.objects
  for delete using (bucket_id = 'category-assets' and is_admin());
