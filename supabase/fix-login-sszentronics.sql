-- Fix login for sszentronics@gmail.com
-- Password will be set to: CHANGE_ME_ADMIN_PASSWORD
-- Run in SQL Editor:
-- https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new
--
-- IMPORTANT: This only works if the Auth user already exists.
-- If the SELECT at the bottom returns 0 rows, create the user first:
-- Authentication → Users → Add user → email + password CHANGE_ME_ADMIN_PASSWORD → Auto Confirm ON

create extension if not exists pgcrypto with schema extensions;

-- 1) Confirm email + set password (bcrypt)
update auth.users
set
  encrypted_password = extensions.crypt('CHANGE_ME_ADMIN_PASSWORD', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '',
  updated_at = timezone('utc', now())
where lower(email) = lower('sszentronics@gmail.com');

-- 2) Ensure profile row exists
insert into public.profiles (auth_user_id, email, first_name, last_name, is_admin)
select u.id, u.email, 'SS', 'Zentronics', true
from auth.users u
where lower(u.email) = lower('sszentronics@gmail.com')
  and not exists (
    select 1 from public.profiles p where p.auth_user_id = u.id
  );

-- 3) Promote to admin
update public.profiles
set is_admin = true,
    email = 'sszentronics@gmail.com'
where auth_user_id in (
  select id from auth.users where lower(email) = lower('sszentronics@gmail.com')
);

-- 4) Verify (must show 1 row, is_admin = true)
select
  u.id as auth_user_id,
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  p.id as profile_id,
  p.is_admin
from auth.users u
left join public.profiles p on p.auth_user_id = u.id
where lower(u.email) = lower('sszentronics@gmail.com');
