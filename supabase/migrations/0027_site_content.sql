-- Storefront copy edited from /admin/content.
-- One row, public read, admin write. The static site reads it with the
-- anon key, so no application server is required.

create table if not exists public.site_content (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.site_content is 'Admin-authored homepage copy: announcement, hero slides, and story block.';

alter table public.site_content enable row level security;

create policy site_content_public_read on public.site_content
  for select to anon, authenticated
  using (true);

create policy site_content_admin_write on public.site_content
  for all to authenticated
  using (is_admin())
  with check (is_admin());

grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated, service_role;
