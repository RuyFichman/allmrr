-- RLS and privilege tests. Runs inside a transaction and rolls back.
-- Local: `npx supabase test db`. Remote dev project: run the file as one SQL batch.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner, so RLS does not apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@test.local', '{"provider":"x"}', '{"user_name":"rls_alice","full_name":"Alice"}', now(), now()),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@test.local', '{"provider":"github"}', '{"user_name":"rls_alice","full_name":"Bob"}', now(), now());

insert into public.startups (id, slug, name, website_url, declared_business_model_id, status, created_by)
values
  ('00000000-0000-4000-b000-000000000001', 'rls-alice-draft', 'Alice Draft', 'https://draft.test',
   (select id from public.business_models where slug = 'micro-saas'), 'draft', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000002', 'rls-alice-live', 'Alice Live', 'https://live.test',
   (select id from public.business_models where slug = 'saas'), 'published', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-000000000003', 'rls-alice-hidden', 'Alice Hidden', 'https://hidden.test',
   (select id from public.business_models where slug = 'saas'), 'hidden', '00000000-0000-4000-a000-00000000000a');

insert into public.revenue_connections (id, startup_id, provider, encrypted_credentials, key_last4)
values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', 'stripe', 'ciphertext', 'ab12'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 'stripe', 'ciphertext-draft', 'cd34');

insert into public.connection_revenue_snapshots (connection_id, date, mrr_cents, revenue_total_cents)
values
  ('00000000-0000-4000-c000-000000000001', current_date, 1000, 5000),
  ('00000000-0000-4000-c000-000000000002', current_date, 2000, 9000);

insert into public.sync_runs (connection_id, trigger, status)
values ('00000000-0000-4000-c000-000000000001', 'manual', 'succeeded');

insert into public.fx_rates (date, currency, usd_rate) values (current_date, 'EUR', 1.1);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

select is(
  (select username::text from public.profiles where id = '00000000-0000-4000-a000-00000000000b'),
  'rls_alice2',
  'profile trigger suffixes a colliding username'
);

select is(
  (select x_handle from public.profiles where id = '00000000-0000-4000-a000-00000000000a'),
  'rls_alice',
  'profile trigger copies the X handle for X sign-ins'
);

select is(
  (select count(*)::int from public.startup_founders
    where startup_id = '00000000-0000-4000-b000-000000000001'
      and profile_id = '00000000-0000-4000-a000-00000000000a'),
  1,
  'creator is added as founder'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::int from public.startups where id = '00000000-0000-4000-b000-000000000001'),
  0,
  'anon cannot read drafts'
);

select is(
  (select count(*)::int from public.startup_directory where slug = 'rls-alice-live'),
  1,
  'anon reads published startups through the directory view'
);

select throws_ok(
  $$ select encrypted_credentials from public.revenue_connections $$,
  '42501',
  null,
  'anon cannot read encrypted_credentials'
);

select is(
  (select count(*)::int from public.connection_revenue_snapshots),
  1,
  'anon reads connection snapshots of published startups only'
);

select throws_ok(
  $$ select * from public.fx_rates $$,
  '42501',
  null,
  'anon cannot read fx_rates'
);

select throws_ok(
  $$ select public.refresh_verification() $$,
  '42501',
  null,
  'anon cannot call the verification refresh'
);

-- ---------------------------------------------------------------------------
-- User B (not a founder)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.startups where id = '00000000-0000-4000-b000-000000000001'),
  0,
  'user B cannot read user A''s draft'
);

select is_empty(
  $$ update public.startups set name = 'Hijacked'
     where id = '00000000-0000-4000-b000-000000000002' returning id $$,
  'user B cannot edit user A''s startup'
);

select throws_ok(
  $$ insert into public.startup_founders (startup_id, profile_id)
     values ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000b') $$,
  '42501',
  null,
  'user B cannot add themselves as a founder'
);

select is(
  (select count(*)::int from public.sync_runs),
  0,
  'user B cannot see user A''s sync runs'
);

select throws_ok(
  $$ select public.consume_rate_limit('00000000-0000-4000-a000-00000000000b', 'connect', '00000000-0000-4000-b000-000000000002', 1000, 1) $$,
  '42501',
  null,
  'clients cannot call the rate limiter directly'
);

select throws_ok(
  $$ insert into public.startups (slug, name, website_url, declared_business_model_id, created_by)
     values ('rls-spoof', 'Spoof', 'https://spoof.test',
       (select id from public.business_models where slug = 'saas'), '00000000-0000-4000-a000-00000000000a') $$,
  '42501',
  null,
  'user B cannot create a startup on behalf of user A'
);

-- ---------------------------------------------------------------------------
-- User A (founder)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ select encrypted_credentials from public.revenue_connections $$,
  '42501',
  null,
  'founders cannot read encrypted_credentials either'
);

select is(
  (select key_last4 from public.revenue_connections where startup_id = '00000000-0000-4000-b000-000000000002'),
  'ab12',
  'founders can read connection metadata'
);

select is(
  (select count(*)::int from public.sync_runs),
  1,
  'founders see their sync runs'
);

select throws_ok(
  $$ update public.revenue_connections set status = 'active' where startup_id = '00000000-0000-4000-b000-000000000002' $$,
  '42501',
  null,
  'founders cannot write connections directly'
);

select throws_ok(
  $$ insert into public.connection_revenue_snapshots (connection_id, date, mrr_cents)
     values ('00000000-0000-4000-c000-000000000001', current_date - 1, 99999999) $$,
  '42501',
  null,
  'founders cannot write snapshots'
);

select throws_ok(
  $$ update public.startups set is_verified = true where id = '00000000-0000-4000-b000-000000000001' $$,
  '42501',
  null,
  'a client cannot set is_verified on update'
);

select throws_ok(
  $$ insert into public.startups (slug, name, website_url, declared_business_model_id, created_by, is_verified)
     values ('rls-fake-verified', 'Fake', 'https://fake.test',
       (select id from public.business_models where slug = 'saas'), '00000000-0000-4000-a000-00000000000a', true) $$,
  '42501',
  null,
  'a client cannot set is_verified on insert'
);

select throws_ok(
  $$ update public.startups set business_model_id = (select id from public.business_models where slug = 'oaas')
     where id = '00000000-0000-4000-b000-000000000001' $$,
  '42501',
  null,
  'a client cannot set the effective business model'
);

update public.startups
set declared_business_model_id = (select id from public.business_models where slug = 'aaas')
where id = '00000000-0000-4000-b000-000000000001';

select is(
  (select bm.slug from public.startups s join public.business_models bm on bm.id = s.business_model_id
    where s.id = '00000000-0000-4000-b000-000000000001'),
  'aaas',
  'founder edits the declared model and the effective model follows while pending'
);

select throws_ok(
  $$ update public.startups set status = 'hidden' where id = '00000000-0000-4000-b000-000000000001' $$,
  '42501',
  null,
  'a client cannot hide a startup'
);

update public.startups set status = 'published' where id = '00000000-0000-4000-b000-000000000003';

select is(
  (select status::text from public.startups where id = '00000000-0000-4000-b000-000000000003'),
  'hidden',
  'a client cannot unhide a moderated startup'
);

select throws_ok(
  $$ select public.refresh_startup_revenue('00000000-0000-4000-b000-000000000002') $$,
  '42501', null, 'founders cannot rebuild rollups directly'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.refresh_startup_revenue('00000000-0000-4000-b000-000000000002') $$,
  '42501', null, 'anonymous callers cannot rebuild rollups'
);

reset role;
set local role service_role;

insert into public.revenue_connections (id, startup_id, provider, encrypted_credentials, external_account_id)
values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000002',
  'paddle', 'fixture-only', 'rls-paddle-account');

select throws_ok(
  $$ insert into public.revenue_connections (startup_id, provider, encrypted_credentials, external_account_id)
     values ('00000000-0000-4000-b000-000000000001', 'paddle', 'fixture-only', 'rls-paddle-account') $$,
  '23505', null, 'a provider account cannot verify two startups'
);

update public.revenue_connections set last_success_at = now()
where id = '00000000-0000-4000-c000-000000000001';

insert into public.connection_revenue_snapshots
  (connection_id, date, mrr_cents, revenue_cents, revenue_total_cents, active_subscriptions, is_estimated)
values
  ('00000000-0000-4000-c000-000000000001', current_date - 31, 500, 100, 1000, 1, true),
  ('00000000-0000-4000-c000-000000000001', current_date - 30, 500, 100, 1100, 1, false),
  ('00000000-0000-4000-c000-000000000003', current_date - 30, 1500, 200, 2200, 2, true),
  ('00000000-0000-4000-c000-000000000003', current_date, 2000, 300, 7000, 2, false);

select public.refresh_startup_revenue('00000000-0000-4000-b000-000000000002');
select is((select count(*)::int from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002'), 2,
  'shorter connection history excludes incomplete days');
-- Hand calculation: current MRR 1000 + 2000; all-time revenue 5000 + 7000.
select is((select mrr_cents from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002' and date = current_date),
  3000::bigint, 'complete-day MRR sums both accounts');
select is((select revenue_total_cents from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002' and date = current_date),
  12000::bigint, 'all-time totals include each account full history');
select ok((select is_estimated from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002' and date = current_date - 30),
  'one estimated component makes the combined day estimated');
-- Hand calculation: (3000 - (500 + 1500)) / 2000 * 100 = 50%.
select is((select growth_30d_pct from public.startup_directory where slug = 'rls-alice-live'),
  50.0::numeric, 'public growth compares complete rollups');

update public.revenue_connections set status = 'error'
where id = '00000000-0000-4000-c000-000000000003';
select public.refresh_startup_revenue('00000000-0000-4000-b000-000000000002');
select is((select mrr_cents from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002' and date = current_date),
  3000::bigint, 'a failing connection does not disappear from totals');
select ok((select is_verified from public.startups
  where id = '00000000-0000-4000-b000-000000000002'),
  'one recent active connection still verifies the startup');

update public.revenue_connections set encrypted_credentials = null, disconnected_at = now(), status = 'revoked'
where id = '00000000-0000-4000-c000-000000000003';
select public.refresh_startup_revenue('00000000-0000-4000-b000-000000000002');
select is((select mrr_cents from public.revenue_snapshots
  where startup_id = '00000000-0000-4000-b000-000000000002' and date = current_date),
  1000::bigint, 'explicit disconnect removes the account from totals');
select is((select count(*)::int from public.connection_revenue_snapshots
  where connection_id = '00000000-0000-4000-c000-000000000003'),
  2, 'disconnect and rollup preserve connection snapshots');

reset role;
select * from finish();

rollback;
