-- 0004_catalog_brands_categories_collections.sql
-- Brands, hierarchical categories, and time-boxed collections.
-- No real category/collection data is seeded here — content is backend-driven.

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  logo_url text,
  website_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create trigger trg_brands_updated_at
  before update on brands
  for each row execute function set_updated_at();

create index idx_brands_slug on brands (slug);
create index idx_brands_status on brands (status);

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories (id) on delete set null,
  name text not null,
  slug citext not null unique,
  description text,
  image_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_categories_not_self_parent check (parent_id is distinct from id)
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index idx_categories_slug on categories (slug);
create index idx_categories_parent_id on categories (parent_id);
create index idx_categories_status on categories (status);

create table collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  image_url text,
  status content_status not null default 'draft',
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_collections_date_range check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create trigger trg_collections_updated_at
  before update on collections
  for each row execute function set_updated_at();

create index idx_collections_slug on collections (slug);
create index idx_collections_status on collections (status);
