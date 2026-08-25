-- Fix "permission denied for table profiles"
-- Cause: tables were created without GRANTs for anon/authenticated roles.
-- RLS still applies; these grants only allow the roles to reach the policies.
--
-- Run in SQL Editor:
-- https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new

-- Schema usage
grant usage on schema public to postgres, anon, authenticated, service_role;

-- All existing tables
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

-- Sequences (ids)
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Future tables created in public
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Make sure admin profile is linked (safe to re-run)
insert into public.profiles (auth_user_id, email, first_name, last_name, is_admin, status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'first_name', 'SS'),
  coalesce(u.raw_user_meta_data ->> 'last_name', 'Zentronics'),
  true,
  'active'
from auth.users u
where lower(u.email) = lower('sszentronics@gmail.com')
on conflict (auth_user_id) do update
set
  email = excluded.email,
  is_admin = true,
  status = 'active',
  updated_at = timezone('utc', now());

-- Verify grants + admin row
select
  u.email,
  p.is_admin,
  has_table_privilege('authenticated', 'public.profiles', 'select') as authenticated_can_select_profiles
from auth.users u
left join public.profiles p on p.auth_user_id = u.id
where lower(u.email) = lower('sszentronics@gmail.com');
