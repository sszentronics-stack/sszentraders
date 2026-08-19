-- 0003_customer_addresses.sql
-- Pakistani-address-shaped, but not hard-locked to one city/country so the
-- schema can later serve other markets without a migration.

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  label text,                          -- e.g. "Home", "Office"
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  province text,                       -- e.g. Punjab, Sindh (nullable: not every country uses province/state)
  postal_code text,
  country text not null default 'PK',
  landmark text,
  is_default_shipping boolean not null default false,
  is_default_billing boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_customer_addresses_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

create index idx_customer_addresses_customer_id on customer_addresses (customer_id);

-- Only one default shipping / default billing address per customer.
create unique index uq_customer_addresses_default_shipping
  on customer_addresses (customer_id)
  where is_default_shipping;

create unique index uq_customer_addresses_default_billing
  on customer_addresses (customer_id)
  where is_default_billing;
