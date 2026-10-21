import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    // Daily revenue sync at 03:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET`.
    { path: "/api/cron/sync-revenue", schedule: "0 3 * * *" },
  ],
};
