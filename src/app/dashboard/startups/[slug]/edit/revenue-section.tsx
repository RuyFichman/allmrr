import { createClient } from "@/lib/supabase/server";
import { addDays, toDay } from "@/lib/revenue/dates";
import { growth30d } from "@/lib/revenue/growth";
import { STRIPE_PERMISSIONS } from "@/lib/revenue/providers/stripe-permissions";
import { ConnectStripeForm } from "./connect-stripe-form";
import { ConnectionPanel, type ConnectionView } from "./connection-panel";

// Founder-only data, read through RLS with the user's session (metadata columns only).
export async function RevenueSection({ startupId }: { startupId: string }) {
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("revenue_connections")
    .select(
      "id, provider, status, key_last4, external_account_id, last_sync_started_at, last_synced_at, last_success_at, last_error, disconnected_at, created_at"
    )
    .eq("startup_id", startupId)
    .eq("provider", "stripe")
    .maybeSingle();

  const live = connection && !connection.disconnected_at ? connection : null;
  const today = toDay(new Date());

  const [runResult, snapshotsResult] = live
    ? await Promise.all([
        supabase
          .from("sync_runs")
          .select("status, trigger, started_at, finished_at, stats, error")
          .eq("connection_id", live.id)
          .neq("status", "skipped")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("connection_revenue_snapshots")
          .select("date, mrr_cents, revenue_total_cents, active_subscriptions, is_estimated")
          .eq("connection_id", live.id)
          .gte("date", addDays(today, -45))
          .order("date", { ascending: false }),
      ])
    : [null, null];

  const rows = snapshotsResult?.data ?? [];
  const latest = rows[0] ?? null;
  const view: ConnectionView | null = live
    ? {
        keyLast4: live.key_last4,
        status: live.status,
        hasAccountId: live.external_account_id !== null,
        // Postgres trims trailing zeros in fractional seconds, so compare as dates, not strings.
        syncing:
          live.last_sync_started_at !== null &&
          (live.last_synced_at === null || Date.parse(live.last_synced_at) < Date.parse(live.last_sync_started_at)),
        lastSuccessAt: live.last_success_at,
        lastError: live.last_error,
        connectedAt: live.created_at,
        run: runResult?.data
          ? {
              status: runResult.data.status,
              trigger: runResult.data.trigger,
              startedAt: runResult.data.started_at,
              finishedAt: runResult.data.finished_at,
              stats: (runResult.data.stats ?? {}) as Record<string, number | string>,
              error: runResult.data.error,
            }
          : null,
        preview: latest
          ? {
              date: latest.date,
              mrrCents: latest.mrr_cents,
              revenueTotalCents: latest.revenue_total_cents,
              activeSubscriptions: latest.active_subscriptions,
              growth30dPct: growth30d(rows.map((r) => ({ date: r.date, mrrCents: r.mrr_cents })), latest.date),
              hasEstimatedHistory: rows.some((r) => r.is_estimated),
            }
          : null,
      }
    : null;

  return (
    <section aria-labelledby="revenue-heading" className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <div>
        <h2 id="revenue-heading" className="text-lg font-semibold">
          Revenue
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Stripe with a read-only key to show verified MRR and total revenue.
        </p>
      </div>
      {view ? (
        <ConnectionPanel startupId={startupId} connection={view} />
      ) : (
        <ConnectStripeForm
          startupId={startupId}
          permissions={STRIPE_PERMISSIONS}
          testMode={process.env.ALLOW_STRIPE_TEST_KEYS === "true"}
          wasDisconnected={Boolean(connection?.disconnected_at)}
        />
      )}
    </section>
  );
}
