<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AllMRR: agent guide

AllMRR is a public directory of startups with **verified revenue**, ranked by **business model**
(SaaS, Micro-SaaS, OaaS, AI Agents, Marketplace…). Think "TrustMRR, segmented by business model".
Founders connect a payment provider with a **read-only** key; we sync revenue daily and show
MRR, total revenue and growth with a "Verified" badge.

- Product plan, taxonomy and decisions: `docs/SPRINTS.md` (Portuguese). **Read it before starting a
  task** and never build features from a later sprint.
- Revenue math (public trust page source): `docs/revenue-methodology.md`.
- Credential handling and key rotation: `docs/security.md`.

## Language

- Product UI, code, comments, commit messages and database content: **English**.
- Reports and summaries to the project owner: **Portuguese (pt-BR)**.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, `cacheComponents: true`, `partialPrefetching: true`), React 19, TypeScript (strict) |
| UI | Tailwind CSS 4, shadcn/ui with the **Base UI** style (`base-nova`), lucide-react, next-themes |
| Database / Auth / Storage | Supabase (Postgres 17, RLS everywhere, OAuth with X, Google and GitHub, `logos` bucket) |
| Payments data | `stripe` SDK, API version pinned to `Stripe.API_VERSION` of the installed SDK |
| Validation | zod 4 |
| Tests | Vitest 4 (unit), pgTAP (`supabase/tests/rls.sql`) |
| Hosting / cron | Vercel, configured in `vercel.ts` with `@vercel/config` |

Do not add dependencies without a clear need. Pin exact versions (`--save-exact`).

## Commands

```bash
npm run dev            # next dev
npm run build          # production build (validates Cache Components rules)
npm run lint           # eslint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # vitest run
npm run stripe:fixtures  # seeds a Stripe TEST account (requires sk_test_ key)
npx shadcn@latest add <name> --yes   # add a UI component
npx -y supabase@2 migration new <name>  # create a migration file
```

Run `npx next typegen` before `tsc` whenever you add or rename routes (it generates `PageProps`,
`LayoutProps` and `RouteContext`).

**Definition of done for any change:** `npm run typecheck`, `npm run lint`, `npm test` and
`npm run build` all pass. Verify behavior in the running app when you touch UI or data flows.

## Repository layout

```
src/
  app/                      routes (App Router)
    [model]/                business-model pages (/saas, /micro-saas…); static routes win over it
    startup/[slug]/         public startup page
    startups/               public listing with filters and pagination
    dashboard/              founder area (protected by src/proxy.ts)
      startups/actions.ts   create/update startup Server Actions
      startups/revenue-actions.ts  connect/sync/disconnect Stripe Server Actions
    api/cron/sync-revenue/  daily sync route (Bearer CRON_SECRET)
    auth/callback/          OAuth callback (uses safeNextPath)
  components/               app components; components/ui = shadcn (Base UI)
  lib/
    data/                   cached public reads ("use cache" + cache tags)
    supabase/               server.ts, client.ts, proxy.ts, public.ts, admin.ts, database.types.ts
    revenue/                provider-agnostic revenue math (pure) + sync engine
      providers/            stripe.ts (network), stripe-mapping.ts (pure), stripe-permissions.ts
    crypto/                 secrets.ts (AES-256-GCM), redact.ts
    validation/             zod schemas
  proxy.ts                  route protection ("middleware" is called proxy in Next 16)
supabase/
  migrations/               schema changes (filenames match the remote versions)
  seed.sql                  DEV ONLY fake data
  tests/rls.sql             pgTAP RLS tests
docs/                       SPRINTS.md, security.md, revenue-methodology.md
scripts/stripe-fixtures.ts  Stripe test-account fixtures
vercel.ts                   Vercel config (crons)
```

## Next.js 16 rules for this project

- **Cache Components is on.** Any request-time access (`cookies()`, `headers()`, `searchParams`,
  `params` without `generateStaticParams`, auth) must sit inside a `<Suspense>` boundary, or the
  build fails.
- Public data is read in `src/lib/data/*` with `"use cache"`, an explicit `cacheLife(...)` and
  `cacheTag(...)` using the constants in `src/lib/data/cache-tags.ts` (`taxonomy`, `startups`,
  `startup:{slug}`). Use `createPublicClient()` (cookie-free) inside cached scopes.
- After a mutation, invalidate tags: `updateTag()` inside Server Actions; `revalidateTag(tag, { expire: 0 })`
  in route handlers and background work (the one-argument form is deprecated).
- `src/lib/supabase/server.ts` awaits `connection()` so session checks never run during runtime
  prerenders (Partial Prefetching flags `Date.now()` in `getClaims()` otherwise). Keep it.
- `generateStaticParams` must return at least one param (use a placeholder that renders `notFound()`).
- `dynamicParams`, `dynamic`, `revalidate` and `fetchCache` segment configs are not available.
  `maxDuration` is.
- Background work after a response: `after()` from `next/server`.
- `notFound()` after streaming has started returns a 200 with `noindex` (soft 404). The root layout
  streams the header's account slot, so unknown slugs are soft 404s today; a real 404 needs a check
  in `src/proxy.ts`.
- Server Actions body limit is 2 MB (`next.config.ts`) because of logo uploads.

## UI conventions

- shadcn/ui uses **Base UI**: polymorphism is the `render` prop (`<Button render={<Link href="/x" />}>`),
  **not** `asChild`. Components using Base UI hooks need `"use client"` (e.g. `badge.tsx`).
- Forms: Server Actions + zod, `useActionState` for errors and pending state, labelled inputs,
  errors linked via `aria-describedby`, `aria-invalid` on invalid fields, visible focus rings.
- Layouts must work at **375px** with no horizontal scroll.
- Never trigger browser dialogs (`confirm`/`alert`); use in-page two-step confirmations.
- Timestamps rendered on the server use `formatDateTimeUtc` so server and client output match.
- Money in the UI: `formatUsd` / `formatUsdCompact` from `src/lib/format.ts`.

## Code style

- Match the surrounding code: double quotes, semicolons, 2-space indent, named exports,
  `@/` path alias, kebab-case filenames.
- Comments are short and explain *why*, not *what*. Keep the existing comment density.
- Put pure logic in `src/lib` with unit tests; keep network and database code thin.
- Never use `getSession()` on the server; use `supabase.auth.getClaims()`.

## Database (Supabase)

- **Money is `bigint` USD cents everywhere.** Timestamps are `timestamptz`; PKs are `uuid`
  (`gen_random_uuid()`); every table has `created_at`/`updated_at` with the `private.set_updated_at`
  trigger; every FK and filter column has an index; names are `snake_case`.
- **RLS on every table, no exceptions.** Supabase grants new tables to `anon`/`authenticated` by
  default: always `revoke all` and grant exactly what is needed (column-level grants where a column
  is sensitive or system-owned).
- Policies wrap `auth.uid()` as `(select auth.uid())`, use `TO anon`/`TO authenticated` (never
  `auth.role()`), and use one permissive policy per role and action.
- Internal helpers live in the non-exposed `private` schema (`is_startup_founder`,
  `is_published_startup`, `can_read_connection`…). `SECURITY DEFINER` only when needed, always with
  `set search_path = ''`.
- Views use `security_invoker = true`. Data that clients may not read directly reaches views through
  a private definer function (see `private.startup_verification`).
- System-owned columns are protected by column privileges and triggers, not only app code:
  `startups.is_verified`, `business_model_id`, `model_review_status`, `published_at`; the `hidden`
  status is moderation-only.
- Service-role-only RPCs: `consume_rate_limit`, `claim_connection_sync`, `refresh_verification`,
  `refresh_startup_revenue`.

### Migration workflow

1. `npx -y supabase@2 migration new <name>` and write the SQL.
2. Apply to the **dev** project only with explicit approval from the owner. **Never touch a remote or
   production project without asking.**
3. After applying through the MCP, rename the local file to the version reported by
   `list_migrations`, so local and remote histories match.
4. Run the security and performance advisors; fix real findings.
5. Regenerate `src/lib/supabase/database.types.ts`.
6. Extend and run `supabase/tests/rls.sql` for any new table, policy or grant.

Gotcha: the Supabase MCP fails with `Invalid or expired requestState` on statements it treats as
destructive (`drop view`, `drop constraint`, `delete`). Prefer non-destructive DDL
(`create or replace view` with new columns appended); for data cleanup use a service-role script.

Running the pgTAP file on the remote dev project: wrap it in a transaction that collects TAP lines
into a temp table and ends with `raise exception` carrying the output, so nothing is ever committed.

## Revenue verification (security rules, non-negotiable)

- Accept only Stripe **restricted keys**: `rk_live_…`; `rk_test_…` only when
  `ALLOW_STRIPE_TEST_KEYS=true`. Reject `sk_…` and `pk_…` with an explanation. Validate with
  read-only `list({ limit: 1 })` calls per permission. **Never** perform write probes.
- Credentials are encrypted with AES-256-GCM in `src/lib/crypto/secrets.ts`
  (`v<version>:<iv>:<tag>:<ciphertext>`, connection id as AAD). The connection id must exist before
  encrypting.
- Decrypt only in server-only sync code (`import "server-only"`). The plaintext key is never
  returned to the client, logged, cached or put in an error. Redact `(sk|rk|pk)_(live|test)_…`
  everywhere (`src/lib/crypto/redact.ts`).
- `encrypted_credentials` is never selectable by `anon`/`authenticated`. All writes to connections,
  snapshots, `fx_rates` and `sync_runs` use the service-role client (`src/lib/supabase/admin.ts`)
  **after** a server-side check that the user is in `startup_founders` for that startup.
- Disconnect nulls the ciphertext immediately; snapshots stay; the startup loses Verified.
- One live connection per `(provider, external_account_id)`.
- Rate limits: 5 connect attempts per hour and 1 manual sync per 10 minutes, per user and startup.
- Required Stripe permissions (all **Read**): Billing → Subscriptions, Prices, Coupons; Core →
  Balance; optional Core → Accounts. Source of truth: `src/lib/revenue/providers/stripe-permissions.ts`.
  Stripe has no official pre-filled restricted-key URL; show instructions instead.
- Never weaken RLS, skip validation or mock the math to make a check pass.

## Revenue math

All in `src/lib/revenue/*.ts`, pure and unit-tested on normalized types (`types.ts`); providers map
into them (`providers/*-mapping.ts`). Full rules in `docs/revenue-methodology.md`. Key points:

- MRR counts `active` and `past_due` (including `cancel_at_period_end`); excludes `trialing`,
  `incomplete`, `incomplete_expired`, `unpaid`, `canceled`, `paused`.
- Normalize to monthly: day ×365.25/12, week ×52/12, month ÷1, year ÷12, then ÷ `interval_count`.
  Tiered (graduated/volume) and `transform_quantity` supported; metered items skipped and counted.
- Discounts: percent and amount, subscription and item level, respecting `end`; `once` coupons ignored.
- Convert to USD with `fx_rates` (Frankfurter/ECB, previous-day fallback); round **only at the end**.
- Revenue: balance transactions (charges − refunds − lost disputes), gross of fees, converted at the
  transaction's day.
- Growth: `(MRR today − MRR 30 days ago) / MRR 30 days ago`, null when the base is 0.
- Backfill: exact revenue from all history; MRR reconstructed for 24 months and flagged
  `is_estimated`. Incremental syncs rewind 3 days and never overwrite observed MRR.
- Verified = at least one active connection with `last_success_at` within 72 hours.
- Public pages show revenue numbers **only while verified**.

## Environment variables

See `.env.example`. Server-only secrets: `SUPABASE_SECRET_KEY`, `REVENUE_ENCRYPTION_KEY`
(+ `REVENUE_ENCRYPTION_KEY_VERSION` / `REVENUE_ENCRYPTION_KEY_V<n>` during rotation), `CRON_SECRET`.
Dev only: `ALLOW_STRIPE_TEST_KEYS=true`, `STRIPE_FIXTURES_SECRET_KEY` (`sk_test_…`).
`NEXT_PUBLIC_*` values reach the browser, so never put secrets there. Never print secret values in
logs or chat; list variable names only.

## Testing

- Unit tests live next to the code (`*.test.ts`); fixtures in `__fixtures__/*.json`. Vitest aliases
  `server-only` to a stub (`src/test/server-only.ts`).
- Expected values in revenue tests are computed by hand; never copy them from the implementation.
- RLS: `supabase/tests/rls.sql` must cover every table, policy and sensitive column.
- E2E checks use a temporary user and data in the **dev** project only, and must be cleaned up.
- Stripe E2E uses test mode only: `npm run stripe:fixtures`, then connect an `rk_test_` key.

## Git

- Branch per sprint (`sprint-N`); Conventional Commits (`feat(db): …`, `feat(ui): …`, `fix: …`,
  `docs: …`, `test: …`); commit after each phase.
- Commit or push only when asked (or when the sprint plan says to commit per phase).
- Commit the Next.js agent-rules block above together with your work if `next dev` re-adds it.

## Environment notes

- Windows machine: PowerShell and Git Bash are both available. Prefer forward slashes in Bash.
- Docker is installed but usually not running; the local Supabase stack is not used by default.
- `vercel.ts` cron runs daily at 03:00 UTC. On the Hobby plan crons run once a day with imprecise
  timing within the hour, and functions are limited to 300 s (the cron stops starting syncs at 240 s).

## Out of scope until their sprint

Other payment providers (Sprint 3), charts and OG images (Sprint 4), leaderboards and ranking
(Sprint 5), marketplace (Sprint 6), billing (Sprint 7), admin and fraud heuristics (Sprint 8),
email notifications.

## Notes for Sprint 3

- When there are several providers, the startup rollup (`public.refresh_startup_revenue`) should sum
  only the days on which **all** of the startup's connections have data. Today it sums whatever
  rows exist per day, so a connection with a shorter history makes earlier totals drop.
- Support Stripe `currency_options` (multi-currency prices): items whose price currency differs from
  the subscription currency are only counted in `sync_runs.stats.currencyMismatchItems` today.
- Notify the founder when a connection fails several times in a row (`consecutive_failures`), before
  the 72-hour window removes the Verified badge.
