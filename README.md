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

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Postgres + Auth) · Tailwind + shadcn/ui · Vercel.
