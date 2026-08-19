-- docs/phase-2-rls-test-plan.sql
-- Phase 2 (Customer Authentication & Profiles) — documented RLS test cases.
--
-- No live Supabase project exists in this environment, so these cannot be
-- executed here. They are written to be run, in order, against a real
-- project's SQL editor (or via `supabase test db` / pgTAP once that harness
-- is set up) once credentials exist. Each block creates two auth.users via
-- Supabase's admin API first (not shown — do this via the dashboard or
-- `supabase.auth.admin.createUser` from a one-off script), then runs as
-- that user by setting `request.jwt.claims` the way PostgREST/Supabase does.
--
-- Convention used below: substitute <alice_auth_uid> / <bob_auth_uid> with
-- real auth.users.id values for two distinct test accounts.

-- ---------------------------------------------------------------------------
-- Setup: assume trigger-created profiles rows already exist for both users
-- (via the `auth` Edge Function's POST /auth, called once per test user).
-- ---------------------------------------------------------------------------

-- 1. A customer can read their own profile, never another customer's.
--    Run as Alice (set role to authenticated, set request.jwt.claim.sub to alice_auth_uid):
--      select * from profiles where auth_user_id = '<alice_auth_uid>'; -- expect 1 row
--      select * from profiles where auth_user_id = '<bob_auth_uid>';   -- expect 0 rows (RLS filters it out, not an error)

-- 2. A customer can update only their own profile row.
--      update profiles set first_name = 'Alice2' where auth_user_id = '<alice_auth_uid>'; -- succeeds
--      update profiles set first_name = 'Hacked' where auth_user_id = '<bob_auth_uid>';    -- affects 0 rows

-- 3. A customer can read/update only their own `customers` row.
--      select * from customers where profile_id = current_profile_id(); -- expect Alice's row only
--      update customers set marketing_opt_in = true where id = '<bobs_customer_id>'; -- affects 0 rows

-- 4. Address ownership: a customer can only see/write their own addresses.
--    As Alice, insert an address (should succeed — the RLS check on
--    customer_addresses_self_all validates customer_id belongs to Alice via
--    current_profile_id()):
--      insert into customer_addresses (customer_id, recipient_name, phone, address_line_1, city)
--      values ('<alices_customer_id>', 'Alice Khan', '03001234567', 'House 1', 'Lahore');
--    As Bob, attempting to read or update Alice's address returns 0 rows /
--    0 rows affected, never an error that reveals the row exists:
--      select * from customer_addresses where id = '<alices_address_id>'; -- expect 0 rows
--      update customer_addresses set city = 'Karachi' where id = '<alices_address_id>'; -- affects 0 rows
--      delete from customer_addresses where id = '<alices_address_id>'; -- affects 0 rows

-- 5. Default-address invariant: only one is_default_shipping = true per customer.
--    As Alice, insert two addresses, mark the first default_shipping, then
--    mark the second default_shipping too — the trigger from
--    0016_address_default_enforcement.sql should silently unset the first
--    without violating uq_customer_addresses_default_shipping:
--      insert into customer_addresses (customer_id, recipient_name, phone, address_line_1, city, is_default_shipping)
--        values ('<alices_customer_id>', 'Alice Khan', '03001234567', 'House 1', 'Lahore', true) returning id; -- addr_a
--      insert into customer_addresses (customer_id, recipient_name, phone, address_line_1, city, is_default_shipping)
--        values ('<alices_customer_id>', 'Alice Khan (Office)', '03001234567', 'House 2', 'Lahore', true) returning id; -- addr_b
--      select id, is_default_shipping from customer_addresses where customer_id = '<alices_customer_id>';
--      -- expect: addr_a.is_default_shipping = false, addr_b.is_default_shipping = true

-- 6. Admin bypass: a profile with is_admin = true can read/update any customer/address row.
--    (Requires manually setting `is_admin = true` on a test admin profile row first.)
--      -- as admin: select * from customers; -- expect all rows, not just admin's own

-- ---------------------------------------------------------------------------
-- Dedup/linking invariant (application-level, not RLS — covered by real unit
-- tests at backend/lib/auth/linking.test.ts, listed here for completeness):
-- ---------------------------------------------------------------------------
-- 7. Calling POST /auth twice for the same authenticated user never creates
--    a second `customers` row for the same profile_id.
--      select count(*) from customers where profile_id = '<alices_profile_id>'; -- expect 1, even after multiple logins

-- 8. If a guest customer row already exists (profile_id is null) with the
--    same email a new registrant uses, registering claims that row instead
--    of creating a duplicate:
--      -- before: one customers row with profile_id = null, email = 'guest@example.com'
--      -- Alice registers with email guest@example.com, then calls POST /auth
--      select count(*) from customers where email = 'guest@example.com'; -- expect 1 (same row, now profile_id = Alice's)
