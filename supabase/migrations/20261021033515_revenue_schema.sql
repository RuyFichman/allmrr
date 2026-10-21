-- Sprint 2: Stripe revenue verification.
-- Per-connection daily snapshots roll up into the startup-level `revenue_snapshots`.
-- Every write here happens through the service role; clients only read.

-- ---------------------------------------------------------------------------
-- revenue_connections: sync bookkeeping and disconnects
-- ---------------------------------------------------------------------------

-- A disconnect wipes the ciphertext but keeps the row, so its snapshots survive.
alter table public.revenue_connections
  alter column encrypted_credentials drop not null,
  add column external_account_id text,
  add column key_last4 text check (key_last4 ~ '^[A-Za-z0-9]{4}$'),
  add column key_version smallint,
  add column last_sync_started_at timestamptz,
  add column last_success_at timestamptz,
  add column consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  add column disconnected_at timestamptz,
  add constraint revenue_connections_credentials_match_state
    check ((disconnected_at is null) = (encrypted_credentials is not null));

comment on column public.revenue_connections.last_synced_at is
  'When the last sync attempt finished, successful or not.';
comment on column public.revenue_connections.last_error is
  'Human-readable error from the last failed sync, with API keys redacted.';

-- One live connection per provider account: the same Stripe account cannot verify two startups.
create unique index revenue_connections_provider_account_key
  on public.revenue_connections (provider, external_account_id)
  where external_account_id is not null and disconnected_at is null;

create index revenue_connections_sync_queue_idx
  on public.revenue_connections (last_synced_at nulls first)
  where disconnected_at is null;

-- Founders see metadata only; encrypted_credentials stays out of every client grant.
grant select (
  external_account_id, key_last4, key_version, last_sync_started_at,
  last_success_at, consecutive_failures, disconnected_at
) on public.revenue_connections to authenticated;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create function private.can_read_connection(p_connection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.revenue_connections c
    where c.id = p_connection_id
      and (private.is_published_startup(c.startup_id) or private.is_startup_founder(c.startup_id))
  );
$$;

create function private.is_connection_founder(p_connection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.revenue_connections c
    where c.id = p_connection_id
      and private.is_startup_founder(c.startup_id)
  );
$$;

revoke all on function private.can_read_connection(uuid) from public;
revoke all on function private.is_connection_founder(uuid) from public;
grant execute on function private.can_read_connection(uuid) to anon, authenticated, service_role;
grant execute on function private.is_connection_founder(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-connection daily snapshots
-- ---------------------------------------------------------------------------

create table public.connection_revenue_snapshots (
  connection_id uuid not null references public.revenue_connections (id) on delete cascade,
  date date not null,
  mrr_cents bigint not null default 0 check (mrr_cents >= 0),
  -- Net revenue booked that day (charges minus refunds and lost disputes); can be negative.
  revenue_cents bigint not null default 0,
  -- All-time net revenue up to and including `date`.
  revenue_total_cents bigint not null default 0,
  active_subscriptions integer not null default 0 check (active_subscriptions >= 0),
  -- MRR reconstructed from current subscription items rather than observed that day.
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (connection_id, date)
);

create trigger connection_revenue_snapshots_set_updated_at
  before update on public.connection_revenue_snapshots
  for each row execute function private.set_updated_at();

-- The startup-level table becomes a rollup of its connections.
alter table public.revenue_snapshots
  add column revenue_cents bigint not null default 0,
  add column is_estimated boolean not null default false;

-- ---------------------------------------------------------------------------
-- FX rates (1 unit of `currency` = usd_rate USD)
-- ---------------------------------------------------------------------------

create table public.fx_rates (
  date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  usd_rate numeric(24, 12) not null check (usd_rate > 0),
  source text not null default 'frankfurter',
  created_at timestamptz not null default now(),
  primary key (date, currency)
);

create index fx_rates_currency_date_idx on public.fx_rates (currency, date desc);

-- ---------------------------------------------------------------------------
-- Sync runs (observability)
-- ---------------------------------------------------------------------------

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.revenue_connections (id) on delete cascade,
  trigger text not null check (trigger in ('connect', 'manual', 'cron')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  -- Redacted, like revenue_connections.last_error.
  error text
);

create index sync_runs_connection_started_idx on public.sync_runs (connection_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting (DB-backed counter, no extra infrastructure)
-- ---------------------------------------------------------------------------

create table private.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  subject_id uuid not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx
  on private.rate_limit_events (user_id, action, subject_id, created_at desc);

alter table private.rate_limit_events enable row level security;
revoke all on private.rate_limit_events from public, anon, authenticated;

-- Records an attempt and returns false when the caller is over the limit.
create function public.consume_rate_limit(
  p_user_id uuid,
  p_action text,
  p_subject_id uuid,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  -- Serialize concurrent attempts for the same counter.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_action || p_subject_id::text, 0));

  select count(*) into recent
  from private.rate_limit_events e
  where e.user_id = p_user_id
    and e.action = p_action
    and e.subject_id = p_subject_id
    and e.created_at > now() - make_interval(secs => p_window_seconds);

  if recent >= p_max then
    return false;
  end if;

  insert into private.rate_limit_events (user_id, action, subject_id)
  values (p_user_id, p_action, p_subject_id);

  delete from private.rate_limit_events e where e.created_at < now() - interval '2 days';
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sync helpers (service role only)
-- ---------------------------------------------------------------------------

-- Atomically marks a connection as syncing. Returns false if a sync started
-- less than p_stale_after_seconds ago and has not finished yet.
create function public.claim_connection_sync(p_connection_id uuid, p_stale_after_seconds integer default 900)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.revenue_connections c
  set last_sync_started_at = now()
  where c.id = p_connection_id
    and c.disconnected_at is null
    and (
      c.last_sync_started_at is null
      or c.last_sync_started_at < now() - make_interval(secs => p_stale_after_seconds)
      or c.last_synced_at >= c.last_sync_started_at
    );
  return found;
end;
$$;

-- Verified = at least one live connection with a successful sync in the last 72 hours.
create function public.refresh_verification(p_startup_id uuid default null)
returns void
language sql
set search_path = ''
as $$
  update public.startups s
  set is_verified = v.verified
  from (
    select
      s2.id,
      exists (
        select 1
        from public.revenue_connections c
        where c.startup_id = s2.id
          and c.status = 'active'
          and c.disconnected_at is null
          and c.last_success_at > now() - interval '72 hours'
      ) as verified
    from public.startups s2
    where p_startup_id is null or s2.id = p_startup_id
  ) v
  where s.id = v.id
    and s.is_verified is distinct from v.verified;
$$;

-- Rebuilds the startup rollup from its connections, then refreshes verification.
-- Startups without connections (e.g. seed data) keep their rows untouched.
create function public.refresh_startup_revenue(p_startup_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.revenue_connections c where c.startup_id = p_startup_id) then
    delete from public.revenue_snapshots r where r.startup_id = p_startup_id;

    insert into public.revenue_snapshots (
      startup_id, date, mrr_cents, revenue_cents, revenue_total_cents, active_subscriptions, is_estimated
    )
    select
      c.startup_id,
      s.date,
      sum(s.mrr_cents),
      sum(s.revenue_cents),
      sum(s.revenue_total_cents),
      sum(s.active_subscriptions),
      bool_or(s.is_estimated)
    from public.connection_revenue_snapshots s
    join public.revenue_connections c on c.id = s.connection_id
    where c.startup_id = p_startup_id
    group by c.startup_id, s.date;
  end if;

  perform public.refresh_verification(p_startup_id);
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_connection_sync(uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_verification(uuid) from public, anon, authenticated;
revoke all on function public.refresh_startup_revenue(uuid) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, uuid, integer, integer) to service_role;
grant execute on function public.claim_connection_sync(uuid, integer) to service_role;
grant execute on function public.refresh_verification(uuid) to service_role;
grant execute on function public.refresh_startup_revenue(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Public directory view, now reading the rollup and verification state
-- ---------------------------------------------------------------------------

-- Connection metadata is founder-only, so the public view gets just the verification
-- summary through a definer function (published startups only).
create function private.startup_verification(p_startup_id uuid)
returns table (verified_at timestamptz, verified_providers text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    max(c.last_success_at),
    coalesce(array_agg(distinct c.provider::text) filter (where c.provider is not null), '{}')
  from public.revenue_connections c
  where c.startup_id = p_startup_id
    and c.status = 'active'
    and c.disconnected_at is null
    and c.last_success_at is not null
    and private.is_published_startup(p_startup_id);
$$;

revoke all on function private.startup_verification(uuid) from public;
grant execute on function private.startup_verification(uuid) to anon, authenticated, service_role;

-- Existing columns keep their order; new ones are appended, so the view is replaced in place.
create or replace view public.startup_directory
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
  end as growth_30d_pct,
  v.verified_at,
  v.verified_providers,
  latest.active_subscriptions,
  latest.is_estimated as revenue_is_estimated
from public.startups s
join public.business_models bm on bm.id = s.business_model_id
left join public.niches n on n.id = s.niche_id
left join lateral private.startup_verification(s.id) v on true
left join lateral (
  select r.date, r.mrr_cents, r.revenue_total_cents, r.active_subscriptions, r.is_estimated
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
-- Grants and RLS for the new tables
-- ---------------------------------------------------------------------------

-- Supabase grants new tables to every API role by default; narrow that explicitly.
revoke all on table public.connection_revenue_snapshots, public.fx_rates, public.sync_runs from anon, authenticated;
grant all on table public.connection_revenue_snapshots, public.fx_rates, public.sync_runs to service_role;
grant select on table public.connection_revenue_snapshots to anon, authenticated;
grant select on table public.sync_runs to authenticated;

alter table public.connection_revenue_snapshots enable row level security;
alter table public.fx_rates enable row level security;
alter table public.sync_runs enable row level security;

create policy "Anyone reads snapshots of published startups and founders their own"
  on public.connection_revenue_snapshots for select
  to anon, authenticated
  using (private.can_read_connection(connection_id));

create policy "Founders read their sync runs"
  on public.sync_runs for select
  to authenticated
  using (private.is_connection_founder(connection_id));

-- fx_rates: RLS on and no policies; only the service role reads and writes it.

-- Seed and pre-Sprint 2 data had no connections, so nothing is verified yet.
select public.refresh_verification();
