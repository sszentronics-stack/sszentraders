-- Aura Beauty Care — bootstrap first admin
-- Run once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new
--
-- What this does:
-- 1) Auto-creates a profiles row when someone signs up (so /admin works
--    even before Edge Functions are deployed).
-- 2) Promotes the earliest profile to is_admin = true.
--    If you already registered, that is usually you.
-- 3) If you prefer a specific email, uncomment the email UPDATE below.

-- ---------------------------------------------------------------------------
-- 1) Profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, email, first_name, last_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', null),
    coalesce(new.raw_user_meta_data ->> 'last_name', null),
    false
  )
  on conflict (auth_user_id) do update
    set email = excluded.email,
        first_name = coalesce(public.profiles.first_name, excluded.first_name),
        last_name = coalesce(public.profiles.last_name, excluded.last_name),
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any auth users that signed up before the trigger existed
insert into public.profiles (auth_user_id, email, is_admin)
select u.id, u.email, false
from auth.users u
where not exists (
  select 1 from public.profiles p where p.auth_user_id = u.id
);

-- ---------------------------------------------------------------------------
-- 2) Promote first / only staff account
-- ---------------------------------------------------------------------------
update public.profiles
set is_admin = true
where id = (
  select id from public.profiles
  order by created_at asc nulls last
  limit 1
);

-- Optional: promote a specific email instead (uncomment + edit):
-- update public.profiles set is_admin = true where email = 'you@example.com';

-- Show who is admin now
select id, email, first_name, last_name, is_admin, created_at
from public.profiles
order by created_at;
