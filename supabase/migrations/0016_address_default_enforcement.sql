-- 0016_address_default_enforcement.sql
-- Phase 2 (Customer Authentication & Profiles).
--
-- customer_addresses already has partial unique indexes guaranteeing at
-- most one is_default_shipping = true / is_default_billing = true row per
-- customer (0003_customer_addresses.sql). Those indexes reject a bad state,
-- but the storefront repository layer (src/repositories/customers.repository.ts)
-- needs an atomic way to *change* the default: "unset the previous default,
-- set the new one" in one round trip, or the partial unique index would
-- reject the second row's insert/update while the first default is still
-- set.
--
-- A BEFORE trigger on the row being promoted to default handles this in the
-- same statement/transaction, and — deliberately NOT security definer — runs
-- under the same role as the outer statement, so it is still subject to the
-- customer_addresses_self_all RLS policy for the sibling rows it updates.
-- Since those sibling rows belong to the same customer (which the RLS policy
-- already allows the authenticated owner to write), this stays authorized
-- for the owning customer without needing a service-role Edge Function.

create or replace function enforce_single_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default_shipping then
    update customer_addresses
    set is_default_shipping = false
    where customer_id = new.customer_id
      and id <> new.id
      and is_default_shipping;
  end if;

  if new.is_default_billing then
    update customer_addresses
    set is_default_billing = false
    where customer_id = new.customer_id
      and id <> new.id
      and is_default_billing;
  end if;

  return new;
end;
$$;

create trigger trg_customer_addresses_single_default
  before insert or update of is_default_shipping, is_default_billing on customer_addresses
  for each row
  when (new.is_default_shipping or new.is_default_billing)
  execute function enforce_single_default_address();

comment on function enforce_single_default_address() is
  'Atomically clears any previous default shipping/billing address for the same customer when a new one is promoted, so the partial unique indexes in 0003_customer_addresses.sql never reject a legitimate "change my default address" update. Runs under the calling role, so it is still bound by RLS on the rows it touches.';
