-- Optional check only — does NOT set the password correctly for Supabase Auth.
-- Use the Dashboard to set password (see instructions below).
-- https://supabase.com/dashboard/project/tiwoqgagrclmbysgexbf/auth/users

-- Show whether the auth user + admin profile exist
select
  u.id as auth_user_id,
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  u.encrypted_password is not null as has_password_hash,
  p.id as profile_id,
  p.is_admin
from auth.users u
left join public.profiles p on p.auth_user_id = u.id
where lower(u.email) = lower('sszentronics@gmail.com');
