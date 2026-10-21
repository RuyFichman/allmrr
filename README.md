# AllMRR

Verified startup revenue, ranked by business model (SaaS, Micro-SaaS, OaaS…).

Sprint plan: [docs/SPRINTS.md](docs/SPRINTS.md)

## Development

```bash
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm install
npm run dev
```

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Postgres + Auth) · Tailwind + shadcn/ui · Vercel.
