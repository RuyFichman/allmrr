-- RLS and privilege tests. Runs inside a transaction and rolls back.
-- Local: `npx supabase test db`. Remote dev project: run the file as one SQL batch.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

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
   (select id from public.business_models where slug = 'saas'), 'published', '00000000-0000-4000-a000-00000000000a');

insert into public.revenue_connections (startup_id, provider, encrypted_credentials)
values ('00000000-0000-4000-b000-000000000002', 'stripe', 'ciphertext');

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
  (select provider::text from public.revenue_connections where startup_id = '00000000-0000-4000-b000-000000000002'),
  'stripe',
  'founders can read connection metadata'
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

select * from finish();

rollback;
