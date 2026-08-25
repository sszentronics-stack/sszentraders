-- Ensure sszentronics@gmail.com can access /admin
-- Run in: https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new

-- 1) Link / create profile for this auth user + set admin
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

-- 2) Confirm email so login stays stable
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
  confirmation_token = '',
  updated_at = timezone('utc', now())
where lower(email) = lower('sszentronics@gmail.com');

-- 3) Verify (must return 1 row: is_admin = true)
select
  u.id as auth_user_id,
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  p.id as profile_id,
  p.is_admin,
  p.auth_user_id = u.id as auth_linked
from auth.users u
left join public.profiles p on p.auth_user_id = u.id
where lower(u.email) = lower('sszentronics@gmail.com');
