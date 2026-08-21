-- 0010_promotions.sql
-- Foundation tables only — no discount engine/evaluation logic in Phase 1 (Phase 13).

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  status promotion_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

create index idx_campaigns_status on campaigns (status);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns (id) on delete set null,
  name text not null,
  description text,
  discount_type text not null,         -- 'percentage' | 'fixed_amount' | 'free_shipping' (validated in app layer)
  discount_value bigint not null default 0,  -- percentage (0-100) or minor-unit amount, per discount_type
  status promotion_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_promotions_discount_value_nonnegative check (discount_value >= 0)
);

create trigger trg_promotions_updated_at
  before update on promotions
  for each row execute function set_updated_at();

create index idx_promotions_campaign_id on promotions (campaign_id);
create index idx_promotions_status on promotions (status);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions (id) on delete cascade,
  code citext not null unique,
  usage_limit integer,
  usage_limit_per_customer integer,
  times_used integer not null default 0,
  status promotion_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_coupons_updated_at
  before update on coupons
  for each row execute function set_updated_at();

create index idx_coupons_code on coupons (code);
create index idx_coupons_promotion_id on coupons (promotion_id);

create table discounts (
  -- Records an applied discount against a specific order (audit trail of what fired).
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  promotion_id uuid references promotions (id) on delete set null,
  coupon_id uuid references coupons (id) on delete set null,
  amount bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chk_discounts_amount_nonnegative check (amount >= 0)
);

create index idx_discounts_order_id on discounts (order_id);
create index idx_discounts_promotion_id on discounts (promotion_id);
create index idx_discounts_coupon_id on discounts (coupon_id);
