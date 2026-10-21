-- ⚠️ DEVELOPMENT SEED. NEVER RUN AGAINST PRODUCTION. ⚠️
-- Creates fake founders in auth.users (the profile trigger fills public.profiles),
-- ~30 fictional startups and 12 months of daily revenue snapshots.
-- Every domain uses the reserved `.example` TLD and every handle starts with `demo_`.
-- Taxonomy (business_models, niches) ships with the schema migration.

-- ---------------------------------------------------------------------------
-- Founders
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  f.id,
  'authenticated',
  'authenticated',
  f.user_name || '@seed.example',
  '',
  now(),
  '{"provider":"x","providers":["x"]}'::jsonb,
  jsonb_build_object('user_name', f.user_name, 'full_name', f.full_name),
  now() - interval '400 days',
  now(),
  '', '', '', ''
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'demo_maya', 'Maya Chen'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'demo_leo', 'Leo Martins'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'demo_priya', 'Priya Raman'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'demo_tom', 'Tom Becker'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'demo_ana', 'Ana Souza'),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'demo_kenji', 'Kenji Watanabe'),
  ('10000000-0000-4000-8000-000000000007'::uuid, 'demo_sara', 'Sara Lindqvist'),
  ('10000000-0000-4000-8000-000000000008'::uuid, 'demo_omar', 'Omar Haddad'),
  ('10000000-0000-4000-8000-000000000009'::uuid, 'demo_julia', 'Julia Novak'),
  ('10000000-0000-4000-8000-000000000010'::uuid, 'demo_diego', 'Diego Ramirez')
) as f (id, user_name, full_name)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Startups
-- curve/start/end describe the fake MRR history in USD (null = no revenue data).
-- ---------------------------------------------------------------------------

create temporary table seed_startups (
  n integer primary key,
  slug text,
  name text,
  tagline text,
  description text,
  model text,
  niche text,
  team_size integer,
  founded_on date,
  status public.startup_status,
  founder integer,
  curve text,
  start_usd integer,
  end_usd integer
) on commit drop;

insert into seed_startups values
  (1,  'pipeline-pilot', 'Pipeline Pilot', 'CRM that books meetings while you sleep', 'Pipeline Pilot automates outbound sequences and keeps the CRM clean without manual data entry.', 'saas', 'sales', 8, '2021-03-01', 'published', 1, 'growth', 60000, 142000),
  (2,  'inboxzen', 'InboxZen', 'Email triage for busy founders', 'A tiny tool that sorts, summarizes and snoozes your inbox every morning.', 'micro-saas', 'productivity', 1, '2023-06-12', 'published', 2, 'growth', 3000, 18000),
  (3,  'leadloop', 'LeadLoop', 'Pay only for qualified B2B leads', 'LeadLoop finds and qualifies prospects, and charges per lead that books a call.', 'oaas', 'sales', 4, '2022-09-20', 'published', 3, 'growth', 10000, 45000),
  (4,  'supportbot-ai', 'SupportBot AI', 'AI agent that resolves support tickets', 'An agent that answers customer tickets end to end and hands off only the tricky ones.', 'aaas', 'customer-support', 3, '2024-01-15', 'published', 4, 'growth', 5000, 38000),
  (5,  'gigcrate', 'GigCrate', 'Marketplace for vetted Shopify freelancers', 'GigCrate matches merchants with vetted freelancers and takes 12% of every project.', 'marketplace', 'ecommerce-tools', 5, '2020-11-02', 'published', 5, 'plateau', 15000, 22000),
  (6,  'the-indie-ledger', 'The Indie Ledger', 'Weekly finance newsletter for indie hackers', 'Taxes, pricing and cash flow explained for bootstrapped founders, every Tuesday.', 'content', 'finance', 1, '2022-02-14', 'published', 6, 'growth', 2000, 9000),
  (7,  'shipfast-academy', 'Shipfast Academy', 'Learn to ship a SaaS in 30 days', 'A cohort-free course with templates, code and videos for first-time builders.', 'info-product', 'developer-tools', 1, '2021-07-07', 'published', 7, 'decline', 30000, 12000),
  (8,  'unlimited-design-co', 'Unlimited Design Co', 'Unlimited design requests, one flat fee', 'A productized design studio: submit requests, get designs in 48 hours.', 'productized-service', 'design', 6, '2020-04-18', 'published', 8, 'plateau', 48000, 55000),
  (9,  'habit-hero', 'Habit Hero', 'Build habits with a pixel-art companion', 'A habit tracker for iOS and Android where your streaks grow a tiny hero.', 'mobile-app', 'health', 2, '2023-03-03', 'published', 9, 'growth', 4000, 21000),
  (10, 'brew-box', 'Brew Box', 'Specialty coffee delivered every month', 'Single-origin beans from small roasters, shipped fresh on a monthly subscription.', 'ecommerce', 'health', 5, '2019-10-10', 'published', 10, 'plateau', 35000, 40000),
  (11, 'loglens', 'LogLens', 'Logs, traces and alerts in one place', 'Observability for small teams with pricing that does not punish growth.', 'saas', 'developer-tools', 12, '2019-05-21', 'published', 1, 'growth', 80000, 150000),
  (12, 'formwise', 'Formwise', 'Beautiful forms without code', 'Drag-and-drop forms with logic, payments and webhooks for no-code builders.', 'micro-saas', 'no-code', 1, '2022-12-01', 'published', 2, 'plateau', 6000, 7500),
  (13, 'metricmint', 'MetricMint', 'Stripe metrics in a single dashboard', 'MRR, churn and LTV from Stripe, explained in plain English.', 'micro-saas', 'analytics', 2, '2024-04-09', 'published', 3, 'growth', 1000, 12000),
  (14, 'paypermeeting', 'PayPerMeeting', 'Booked demos, billed per meeting', 'We run outbound for SaaS companies and only bill for meetings that happen.', 'oaas', 'marketing', 3, '2021-08-30', 'published', 4, 'decline', 25000, 14000),
  (15, 'agentdesk', 'AgentDesk', 'Deploy AI agents for back-office work', 'AgentDesk runs agents that reconcile invoices, chase payments and update records.', 'aaas', 'ai', 5, '2025-01-20', 'published', 5, 'growth', 0, 27000),
  (16, 'vaultkey', 'VaultKey', 'Secrets management for growing teams', 'Rotate, share and audit secrets across environments without the enterprise price tag.', 'saas', 'security', 9, '2020-01-13', 'published', 6, 'plateau', 58000, 65000),
  (17, 'hiresignal', 'HireSignal', 'Find candidates before they apply', 'HireSignal surfaces engineers who are quietly open to new roles.', 'saas', 'hr', 4, '2022-05-05', 'published', 7, 'growth', 30000, 48000),
  (18, 'promptpress', 'PromptPress', 'The newsletter for practical AI', 'Hands-on AI workflows for operators, twice a week.', 'content', 'ai', 1, '2023-09-01', 'published', 8, null, null, null),
  (19, 'template-lab', 'Template Lab', 'Notion templates for founders', 'Operating systems, CRMs and planners built in Notion.', 'info-product', 'productivity', 1, '2022-08-15', 'published', 9, null, null, null),
  (20, 'seo-sprint', 'SEO Sprint', 'A month of SEO, fixed price', 'Technical audit, ten articles and a backlink plan for one flat monthly price.', 'productized-service', 'marketing', 3, '2023-02-27', 'published', 10, null, null, null),
  (21, 'tutorly', 'Tutorly', 'Pocket tutor for high-school math', 'Step-by-step math explanations on your phone, with practice that adapts to you.', 'mobile-app', 'education', 2, '2024-06-10', 'published', 1, null, null, null),
  (22, 'kitchen-craft-co', 'Kitchen Craft Co', 'Handmade cookware, shipped worldwide', 'Carbon-steel pans and knives made in small batches.', 'ecommerce', null, 4, '2021-11-11', 'published', 2, null, null, null),
  (23, 'snapgrid-api', 'Snapgrid API', 'Website screenshots via a simple API', 'Render any URL to PNG or PDF with one HTTP call.', 'micro-saas', 'developer-tools', 1, '2023-01-30', 'published', 3, null, null, null),
  (24, 'churnguard', 'ChurnGuard', 'Predict churn before it happens', 'Health scores and playbooks for customer success teams.', 'saas', 'analytics', 5, '2022-03-19', 'published', 4, null, null, null),
  (25, 'clipcraft-ai', 'Clipcraft AI', 'Turn long videos into viral clips', 'An AI editor that finds the best moments and adds captions.', 'aaas', 'design', 2, '2025-05-02', 'draft', 8, null, null, null),
  (26, 'bookkeep-buddy', 'Bookkeep Buddy', 'Bookkeeping on autopilot for freelancers', 'Connect your bank and get categorized books every month.', 'micro-saas', 'finance', 1, '2025-03-14', 'draft', 9, null, null, null),
  (27, 'talent-cove', 'Talent Cove', 'Marketplace for fractional executives', 'Hire a fractional CFO, CMO or CTO in days.', 'marketplace', 'hr', 3, '2025-02-01', 'draft', 10, null, null, null),
  (28, 'codecoach', 'CodeCoach', 'Interview prep for senior engineers', 'System design drills and mock interviews.', 'info-product', 'education', 1, '2024-11-20', 'draft', 1, null, null, null),
  (29, 'taskpaper', 'Taskpaper', 'Minimalist to-do lists', 'A to-do app that has been sunset.', 'saas', 'productivity', 4, '2018-06-06', 'hidden', 2, null, null, null),
  (30, 'rank-radar', 'Rank Radar', 'Pay per keyword that hits page one', 'SEO results billed per ranking keyword.', 'oaas', 'marketing', 2, '2025-04-04', 'draft', 3, null, null, null);

insert into public.startups (
  id, slug, name, tagline, description, website_url, founded_on, team_size,
  niche_id, declared_business_model_id, business_model_id, model_review_status,
  status, is_verified, published_at, created_by, created_at
)
select
  ('20000000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid,
  s.slug,
  s.name,
  s.tagline,
  s.description,
  'https://' || replace(s.slug, '-', '') || '.example',
  s.founded_on,
  s.team_size,
  n.id,
  bm.id,
  bm.id,
  case when s.curve is not null then 'approved' else 'pending' end::public.model_review_status,
  s.status,
  -- Only a live provider connection verifies revenue (Sprint 2), so seed data never does.
  false,
  case when s.status = 'published' then now() - (s.n || ' days')::interval end,
  ('10000000-0000-4000-8000-' || lpad(s.founder::text, 12, '0'))::uuid,
  now() - ((60 + s.n) || ' days')::interval
from seed_startups s
join public.business_models bm on bm.slug = s.model
left join public.niches n on n.slug = s.niche
on conflict (slug) do nothing;

-- A few teams with cofounders (the creator is added by trigger).
insert into public.startup_founders (startup_id, profile_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'cofounder'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003', 'cofounder'),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000007', 'cofounder')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Revenue snapshots: 365 daily rows per startup with a curve.
-- ---------------------------------------------------------------------------

insert into public.revenue_snapshots (startup_id, date, mrr_cents, revenue_total_cents, active_subscriptions)
select
  startup_id,
  date,
  mrr_cents,
  -- Revenue before the window, plus each day's share of MRR.
  prior_cents + (sum(mrr_cents) over (partition by startup_id order by date) / 30)::bigint,
  (mrr_cents / 3900)::integer
from (
  select
    ('20000000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid as startup_id,
    d.date,
    s.start_usd::bigint * 100 * 8 as prior_cents,
    greatest(0, round(
      100 * (case s.curve
        when 'growth' then s.start_usd + (s.end_usd - s.start_usd) * power(d.t / 364.0, 1.4)
        when 'plateau' then s.start_usd + (s.end_usd - s.start_usd) * (1 - exp(-d.t / 70.0))
        -- Peaks after ~4 months, then slides down to end_usd.
        when 'decline' then case
          when d.t < 120 then s.start_usd * (1 + 0.1 * d.t / 120.0)
          else s.start_usd * 1.1 - (s.start_usd * 1.1 - s.end_usd) * ((d.t - 120) / 244.0)
        end
      end)
      -- Deterministic day-to-day noise of about ±2%.
      * (1 + 0.02 * sin(d.t * 0.9 + s.n))
    ))::bigint as mrr_cents
  from seed_startups s
  cross join lateral (
    select g::date as date, (g::date - (current_date - 364)) as t
    from generate_series(current_date - 364, current_date, interval '1 day') g
  ) d
  where s.curve is not null
) daily
on conflict (startup_id, date) do nothing;
