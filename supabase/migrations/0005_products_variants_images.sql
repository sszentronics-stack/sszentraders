-- 0005_products_variants_images.sql
-- Products describe the sellable "concept"; inventory/price/SKU live on
-- product_variants (a product always has at least one variant in practice,
-- enforced at the application layer, not the DB, to keep migrations simple).

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands (id) on delete set null,
  name text not null,
  slug citext not null unique,
  short_description text,
  description text,
  ingredients text,
  directions text,
  product_type text,
  status content_status not null default 'draft',
  is_featured boolean not null default false,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create index idx_products_slug on products (slug);
create index idx_products_brand_id on products (brand_id);
create index idx_products_status on products (status);
create index idx_products_is_featured on products (is_featured) where is_featured;

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  sku text not null unique,
  barcode text,
  title text,                          -- e.g. "25g", "150ml"
  price bigint not null,               -- minor units, see 0001 comment
  compare_at_price bigint,
  cost_price bigint,
  currency text not null default 'PKR',
  weight numeric(10, 3),
  weight_unit text not null default 'g',
  attributes jsonb not null default '{}'::jsonb,
  status content_status not null default 'draft',
  ledgix_item_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint chk_product_variants_price_nonnegative check (price >= 0),
  constraint chk_product_variants_compare_at_nonnegative check (compare_at_price is null or compare_at_price >= 0),
  constraint chk_product_variants_cost_nonnegative check (cost_price is null or cost_price >= 0)
);

create trigger trg_product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

create index idx_product_variants_product_id on product_variants (product_id);
create index idx_product_variants_sku on product_variants (sku);
create index idx_product_variants_status on product_variants (status);
create unique index uq_product_variants_ledgix_item_id on product_variants (ledgix_item_id) where ledgix_item_id is not null;

comment on column product_variants.price is 'Selling price in minor currency units (see 0001_extensions_and_enums.sql money convention).';
comment on column product_variants.ledgix_item_id is 'Foreign reference to the item/SKU record in LedGix ERP. Null until synced.';

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete cascade,
  storage_path text not null,          -- path within the `product-images` storage bucket
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_product_images_product_id on product_images (product_id);
create index idx_product_images_variant_id on product_images (variant_id);

create unique index uq_product_images_primary_per_product
  on product_images (product_id)
  where is_primary and variant_id is null;

-- Join tables (many-to-many): products <-> categories / collections.
create table product_categories (
  product_id uuid not null references products (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, category_id)
);

create index idx_product_categories_category_id on product_categories (category_id);

create table product_collections (
  product_id uuid not null references products (id) on delete cascade,
  collection_id uuid not null references collections (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, collection_id)
);

create index idx_product_collections_collection_id on product_collections (collection_id);
