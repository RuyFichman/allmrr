# AllMRR

Verified startup revenue, ranked by business model (SaaS, Micro-SaaS, OaaS…).

Sprint plan: [docs/SPRINTS.md](docs/SPRINTS.md)

## Development

```bash
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm install
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Database

Schema changes live in `supabase/migrations/` (RLS on every table). `supabase/seed.sql` loads fake
founders, startups and revenue for development only; never run it against production.
RLS tests: `supabase/tests/rls.sql` (pgTAP, `npx supabase test db` on a local stack).

## Revenue verification (Stripe)

- Founders connect a **read-only restricted key** from the startup's edit page. Keys are encrypted
  with AES-256-GCM (`docs/security.md`); the math is documented in `docs/revenue-methodology.md`.
- A daily Vercel Cron (`vercel.ts`) calls `GET /api/cron/sync-revenue` with
  `Authorization: Bearer $CRON_SECRET`. Trigger it locally with:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-revenue
  ```

### Test data in Stripe

`npm run stripe:fixtures` fills a **Stripe test account** with monthly, annual and quarterly
subscriptions, BRL and EUR prices, a 20% coupon, a trial, a `past_due` (via a test clock), a
cancel-at-period-end subscription and a refunded payment. It reads `STRIPE_FIXTURES_SECRET_KEY`
(from `.env.local`) and refuses to run unless the key starts with `sk_test_`. To connect it in the
app, create a test restricted key with the permissions shown on the Revenue section and set
`ALLOW_STRIPE_TEST_KEYS=true` locally.

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Postgres + Auth) · Tailwind + shadcn/ui · Vercel.
