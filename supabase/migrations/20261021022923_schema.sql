-- Sprint 1: domain model, classification guards and RLS.
-- Money is stored as bigint USD cents. Every table in `public` has RLS enabled
-- and explicit grants; Supabase's default "grant all" is revoked table by table.

create extension if not exists citext with schema extensions;

-- Internal helpers live in a schema that is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.model_review_status as enum ('pending', 'approved', 'overridden');
create type public.startup_status as enum ('draft', 'published', 'hidden');
create type public.revenue_provider as enum ('stripe', 'lemonsqueezy', 'polar', 'paddle', 'revenuecat', 'gumroad');
create type public.revenue_connection_status as enum ('active', 'error', 'revoked');
create type public.listing_status as enum ('active', 'under_offer', 'sold', 'withdrawn');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------

create table public.business_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  criteria text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_models_active_sort_idx on public.business_models (sort_order) where is_active;

create trigger business_models_set_updated_at
  before update on public.business_models
  for each row execute function private.set_updated_at();

create table public.niches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger niches_set_updated_at
  before update on public.niches
  for each row execute function private.set_updated_at();

-- Reference data ships with the schema so every environment has it.
insert into public.business_models (slug, name, description, criteria, sort_order) values
  ('saas', 'SaaS', 'Subscription software businesses with a team or meaningful scale.', 'Subscription software; team > 3 or MRR ≥ $50k', 10),
  ('micro-saas', 'Micro-SaaS', 'Subscription software run by a solo founder or a tiny team.', 'Subscription software; solo/small team (≤ 3) and MRR < $50k', 20),
  ('oaas', 'OaaS (Outcome-as-a-Service)', 'Businesses that charge for results delivered, not for seats or access.', 'Charges per delivered outcome (per lead, sale, resolved ticket…)', 30),
  ('aaas', 'AI Agents', 'AI and agent products billed by usage or subscription.', 'AI/agent product billed by usage or subscription', 40),
  ('marketplace', 'Marketplace', 'Platforms that connect buyers and sellers and take a cut.', 'Revenue from take rate', 50),
  ('content', 'Content & Community', 'Newsletters, paid content and communities.', 'Newsletter, content or community subscriptions', 60),
  ('info-product', 'Info Products', 'Courses, ebooks, templates and other knowledge products.', 'Courses, ebooks, templates', 70),
  ('productized-service', 'Productized Services', 'Fixed-scope, fixed-price services and agencies.', 'Fixed-scope, fixed-price services / agencies', 80),
  ('mobile-app', 'Mobile Apps', 'iOS and Android apps monetized through the stores.', 'App store / RevenueCat revenue', 90),
  ('ecommerce', 'E-commerce', 'Physical goods and direct-to-consumer subscriptions.', 'Physical goods / DTC subscriptions', 100);

insert into public.niches (slug, name) values
  ('ai', 'AI'),
  ('developer-tools', 'Developer Tools'),
  ('marketing', 'Marketing'),
  ('sales', 'Sales'),
  ('productivity', 'Productivity'),
  ('finance', 'Finance'),
  ('analytics', 'Analytics'),
  ('design', 'Design'),
  ('education', 'Education'),
  ('health', 'Health'),
  ('hr', 'HR'),
  ('customer-support', 'Customer Support'),
  ('ecommerce-tools', 'E-commerce Tools'),
  ('security', 'Security'),
  ('no-code', 'No-code');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique check (username ~ '^[A-Za-z0-9_-]{3,39}$'),
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  x_handle text check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  bio text check (char_length(bio) <= 500),
  website_url text check (website_url ~ '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Builds the profile from OAuth metadata. The username gets a numeric suffix on collision.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  provider text := new.raw_app_meta_data ->> 'provider';
  base text;
  candidate text;
  suffix integer := 1;
begin
  base := coalesce(
    meta ->> 'user_name',
    meta ->> 'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  base := left(regexp_replace(lower(coalesce(base, '')), '[^a-z0-9_-]', '', 'g'), 32);
  if char_length(base) < 3 then
    base := 'user';
  end if;
  candidate := base;

  loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url, x_handle)
      values (
        new.id,
        candidate,
        left(coalesce(meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name'), 80),
        meta ->> 'avatar_url',
        case
          when provider in ('x', 'twitter') and (meta ->> 'user_name') ~ '^[A-Za-z0-9_]{1,15}$'
            then meta ->> 'user_name'
        end
      )
      on conflict (id) do nothing;
      exit;
    exception when unique_violation then
      suffix := suffix + 1;
      candidate := base || suffix::text;
      if suffix > 50 then
        candidate := base || '-' || substr(md5(random()::text), 1, 6);
      end if;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Startups
-- ---------------------------------------------------------------------------

create table public.startups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 1 and 80),
  tagline text check (char_length(tagline) <= 80),
  description text check (char_length(description) <= 5000),
  website_url text not null check (website_url ~ '^https?://'),
  logo_url text check (logo_url ~ '^https?://'),
  x_handle text check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  founded_on date,
  team_size integer not null default 1 check (team_size between 1 and 100000),
  niche_id uuid references public.niches (id) on delete restrict,
  -- What the founder picked.
  declared_business_model_id uuid not null references public.business_models (id) on delete restrict,
  -- What the site shows. Follows the declared model until an admin overrides it.
  business_model_id uuid not null references public.business_models (id) on delete restrict,
  model_review_status public.model_review_status not null default 'pending',
  status public.startup_status not null default 'draft',
  is_verified boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index startups_niche_id_idx on public.startups (niche_id);
create index startups_declared_business_model_id_idx on public.startups (declared_business_model_id);
create index startups_business_model_id_idx on public.startups (business_model_id);
create index startups_created_by_idx on public.startups (created_by);
create index startups_status_idx on public.startups (status);
create index startups_published_recent_idx on public.startups (published_at desc) where status = 'published';

create trigger startups_set_updated_at
  before update on public.startups
  for each row execute function private.set_updated_at();

-- Derives the effective model from the declared one and stamps published_at.
-- Column privileges already stop clients from writing the protected columns;
-- this trigger keeps them consistent for every writer.
create function private.startups_classify()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.business_model_id is null then
      new.business_model_id := new.declared_business_model_id;
    end if;
  elsif new.declared_business_model_id is distinct from old.declared_business_model_id
    and new.model_review_status <> 'overridden' then
    -- A new declaration needs a fresh review; an admin override always wins.
    new.business_model_id := new.declared_business_model_id;
    new.model_review_status := 'pending';
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger startups_classify
  before insert or update on public.startups
  for each row execute function private.startups_classify();

-- ---------------------------------------------------------------------------
-- Founders
-- ---------------------------------------------------------------------------

create table public.startup_founders (
  startup_id uuid not null references public.startups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'founder' check (role in ('founder', 'cofounder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (startup_id, profile_id)
);

create index startup_founders_profile_id_idx on public.startup_founders (profile_id);

create trigger startup_founders_set_updated_at
  before update on public.startup_founders
  for each row execute function private.set_updated_at();

create function private.startups_add_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.startup_founders (startup_id, profile_id, role)
    values (new.id, new.created_by, 'founder')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.startups_add_creator() from public, anon, authenticated;

create trigger startups_add_creator
  after insert on public.startups
  for each row execute function private.startups_add_creator();

-- Security definer so policies on startups and startup_founders can reference
-- each other without recursing through RLS.
create function private.is_startup_founder(p_startup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.startup_founders f
    where f.startup_id = p_startup_id
      and f.profile_id = (select auth.uid())
  );
$$;

revoke all on function private.is_startup_founder(uuid) from public;
grant execute on function private.is_startup_founder(uuid) to anon, authenticated, service_role;

create function private.is_published_startup(p_startup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.startups s
    where s.id = p_startup_id
      and s.status = 'published'
  );
$$;

revoke all on function private.is_published_startup(uuid) from public;
grant execute on function private.is_published_startup(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Revenue
-- ---------------------------------------------------------------------------

create table public.revenue_connections (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups (id) on delete cascade,
  provider public.revenue_provider not null,
  status public.revenue_connection_status not null default 'active',
  -- Never granted to anon/authenticated; only service_role reads it.
  encrypted_credentials text not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (startup_id, provider)
);

create index revenue_connections_status_idx on public.revenue_connections (status);

create trigger revenue_connections_set_updated_at
  before update on public.revenue_connections
  for each row execute function private.set_updated_at();

create table public.revenue_snapshots (
  startup_id uuid not null references public.startups (id) on delete cascade,
  date date not null,
  mrr_cents bigint not null default 0 check (mrr_cents >= 0),
  -- Cumulative revenue up to and including `date`.
  revenue_total_cents bigint not null default 0 check (revenue_total_cents >= 0),
  active_subscriptions integer not null default 0 check (active_subscriptions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (startup_id, date)
);

create trigger revenue_snapshots_set_updated_at
  before update on public.revenue_snapshots
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Listings (marketplace UI arrives in Sprint 6)
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null unique references public.startups (id) on delete cascade,
  asking_price_cents bigint not null check (asking_price_cents > 0),
  status public.listing_status not null default 'active',
  reason text check (char_length(reason) <= 2000),
  includes text check (char_length(includes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_status_idx on public.listings (status);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Public directory view
-- ---------------------------------------------------------------------------

-- security_invoker keeps the caller's RLS in force on every underlying table.
create view public.startup_directory
with (security_invoker = true)
as
select
  s.id,
  s.slug,
  s.name,
  s.tagline,
  s.logo_url,
  s.website_url,
  s.x_handle,
  s.is_verified,
  s.published_at,
  s.created_at,
  bm.slug as business_model_slug,
  bm.name as business_model_name,
  n.slug as niche_slug,
  n.name as niche_name,
  latest.date as revenue_as_of,
  latest.mrr_cents,
  latest.revenue_total_cents,
  case
    when prev.mrr_cents > 0
      then round((latest.mrr_cents - prev.mrr_cents) * 100.0 / prev.mrr_cents, 1)
  end as growth_30d_pct
from public.startups s
join public.business_models bm on bm.id = s.business_model_id
left join public.niches n on n.id = s.niche_id
left join lateral (
  select r.date, r.mrr_cents, r.revenue_total_cents
  from public.revenue_snapshots r
  where r.startup_id = s.id
  order by r.date desc
  limit 1
) latest on true
left join lateral (
  select r.mrr_cents
  from public.revenue_snapshots r
  where r.startup_id = s.id
    and r.date <= latest.date - 30
  order by r.date desc
  limit 1
) prev on true
where s.status = 'published';

-- ---------------------------------------------------------------------------
-- Grants (explicit; RLS below narrows rows)
-- ---------------------------------------------------------------------------

revoke all on table
  public.business_models,
  public.niches,
  public.profiles,
  public.startups,
  public.startup_founders,
  public.revenue_connections,
  public.revenue_snapshots,
  public.listings,
  public.startup_directory
from anon, authenticated;

grant all on table
  public.business_models,
  public.niches,
  public.profiles,
  public.startups,
  public.startup_founders,
  public.revenue_connections,
  public.revenue_snapshots,
  public.listings,
  public.startup_directory
to service_role;

grant select on table
  public.business_models,
  public.niches,
  public.profiles,
  public.startups,
  public.startup_founders,
  public.revenue_snapshots,
  public.listings,
  public.startup_directory
to anon, authenticated;

grant update (username, display_name, avatar_url, x_handle, bio, website_url)
  on public.profiles to authenticated;

-- is_verified, business_model_id, model_review_status and published_at are system-only.
grant insert (
  slug, name, tagline, description, website_url, logo_url, x_handle,
  founded_on, team_size, niche_id, declared_business_model_id, status, created_by
) on public.startups to authenticated;

grant update (
  name, tagline, description, website_url, logo_url, x_handle,
  founded_on, team_size, niche_id, declared_business_model_id, status
) on public.startups to authenticated;

grant insert, update, delete on public.startup_founders to authenticated;

-- Metadata only: encrypted_credentials is deliberately left out.
grant select (id, startup_id, provider, status, last_synced_at, last_error, created_at, updated_at)
  on public.revenue_connections to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.business_models enable row level security;
alter table public.niches enable row level security;
alter table public.profiles enable row level security;
alter table public.startups enable row level security;
alter table public.startup_founders enable row level security;
alter table public.revenue_connections enable row level security;
alter table public.revenue_snapshots enable row level security;
alter table public.listings enable row level security;

create policy "Business models are public"
  on public.business_models for select
  to anon, authenticated
  using (true);

create policy "Niches are public"
  on public.niches for select
  to anon, authenticated
  using (true);

create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Anyone reads published startups"
  on public.startups for select
  to anon
  using (status = 'published');

-- created_by covers INSERT ... RETURNING, before the founder row exists.
create policy "Users read published startups and their own"
  on public.startups for select
  to authenticated
  using (
    status = 'published'
    or created_by = (select auth.uid())
    or private.is_startup_founder(id)
  );

create policy "Users create startups as themselves"
  on public.startups for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "Founders update their startups"
  on public.startups for update
  to authenticated
  using (private.is_startup_founder(id))
  with check (private.is_startup_founder(id));

create policy "Anyone reads founders of published startups"
  on public.startup_founders for select
  to anon
  using (private.is_published_startup(startup_id));

create policy "Users read public founders and their own team"
  on public.startup_founders for select
  to authenticated
  using (private.is_published_startup(startup_id) or private.is_startup_founder(startup_id));

create policy "Founders add founders"
  on public.startup_founders for insert
  to authenticated
  with check (private.is_startup_founder(startup_id));

create policy "Founders update founders"
  on public.startup_founders for update
  to authenticated
  using (private.is_startup_founder(startup_id))
  with check (private.is_startup_founder(startup_id));

create policy "Founders remove founders"
  on public.startup_founders for delete
  to authenticated
  using (private.is_startup_founder(startup_id));

create policy "Founders read their connection metadata"
  on public.revenue_connections for select
  to authenticated
  using (private.is_startup_founder(startup_id));

create policy "Anyone reads snapshots of published startups"
  on public.revenue_snapshots for select
  to anon
  using (private.is_published_startup(startup_id));

create policy "Users read public snapshots and their own"
  on public.revenue_snapshots for select
  to authenticated
  using (private.is_published_startup(startup_id) or private.is_startup_founder(startup_id));

create policy "Anyone reads listings of published startups"
  on public.listings for select
  to anon
  using (private.is_published_startup(startup_id));

create policy "Users read public listings and their own"
  on public.listings for select
  to authenticated
  using (private.is_published_startup(startup_id) or private.is_startup_founder(startup_id));
