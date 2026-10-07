-- Public images uploaded from /admin/content: stories, banners, brand
-- tiles, the header logo, and the About photo. Admin write, public read.
-- The public URL is stored inside the site_content document.

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

create policy storage_site_assets_public_read on storage.objects
  for select using (bucket_id = 'site-assets');

create policy storage_site_assets_admin_write on storage.objects
  for insert with check (bucket_id = 'site-assets' and is_admin());

create policy storage_site_assets_admin_update on storage.objects
  for update using (bucket_id = 'site-assets' and is_admin()) with check (bucket_id = 'site-assets' and is_admin());

create policy storage_site_assets_admin_delete on storage.objects
  for delete using (bucket_id = 'site-assets' and is_admin());
