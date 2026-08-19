-- 0002_profiles_customers.sql
-- Profiles (1:1 with Supabase Auth users) and Customers (commerce identity,
-- may exist without a profile for guest checkout).

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  email citext,
  phone text,
  avatar_url text,
  status customer_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create index idx_profiles_auth_user_id on profiles (auth_user_id);
create index idx_profiles_email on profiles (email);

comment on table profiles is 'One row per Supabase Auth user. Holds identity/profile fields separate from commerce data (customers).';

-- Customers: the commerce identity. A customer may or may not be linked to a
-- profile (guest checkout creates a customer with profile_id = null).
create table customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  customer_number text not null unique,
  first_name text,
  last_name text,
  email citext,
  phone text,
  date_of_birth date,
  marketing_opt_in boolean not null default false,
  status customer_status not null default 'active',
  ledgix_customer_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

create index idx_customers_profile_id on customers (profile_id);
create index idx_customers_email on customers (email);
create index idx_customers_phone on customers (phone);
create index idx_customers_status on customers (status);
create unique index idx_customers_ledgix_customer_id on customers (ledgix_customer_id) where ledgix_customer_id is not null;

comment on table customers is 'Commerce-facing customer identity. LedGix ERP is the eventual system of record for customer accounting; ledgix_customer_id links the two once ERP integration (Phase 8) is live.';
comment on column customers.ledgix_customer_id is 'Foreign reference to the customer record in LedGix ERP. Null until synced. Aura never invents or guesses this value.';
