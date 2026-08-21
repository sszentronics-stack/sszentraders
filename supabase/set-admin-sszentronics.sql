-- Promote sszentronics@gmail.com to admin
-- Run in: https://supabase.com/dashboard/project/jooukhdxxllutkdqznqt/sql/new

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

insert into public.profiles (auth_user_id, email, is_admin)
select u.id, u.email, false
from auth.users u
where not exists (
  select 1 from public.profiles p where p.auth_user_id = u.id
);

update public.profiles
set is_admin = true
where lower(email::text) = lower('sszentronics@gmail.com');

select id, email, is_admin, created_at
from public.profiles
where lower(email::text) = lower('sszentronics@gmail.com');
