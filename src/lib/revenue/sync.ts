import "server-only";
import { revalidateTag } from "next/cache";
import { decryptSecret } from "@/lib/crypto/secrets";
import { redactedMessage } from "@/lib/crypto/redact";
import { TAGS } from "@/lib/data/cache-tags";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { addDays, toDay } from "./dates";
import { ensureFxRates, loadFxTable, refreshTrackedFxRates } from "./fx-sync";
import { classifySyncFailure, retryAtFromStats, SyncFailure } from "./failures";
import { getRevenueProvider } from "./provider-registry";
import { buildDailySnapshots, mergeWithExisting } from "./snapshots";
import type { DailySnapshot, NormalizedSubscription, NormalizedTransaction } from "./types";

// Only the last 24 months of MRR are reconstructed; revenue totals still include everything.
const BACKFILL_DAYS = 730;
// Incremental syncs re-read a few days back to catch late refunds and disputes.
const REWIND_DAYS = 3;
const LOCK_SECONDS = 15 * 60;
const UPSERT_CHUNK = 500;

export type SyncTrigger = "connect" | "manual" | "cron";

export type SyncOutcome =
  | { status: "succeeded"; mrrCents: number; days: number }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

async function collect<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

function invalidate(slug: string | null) {
  // Outside a Next.js request (scripts, tests) there is no cache to invalidate.
  try {
    revalidateTag(TAGS.startups, { expire: 0 });
    if (slug) revalidateTag(TAGS.startup(slug), { expire: 0 });
  } catch {}
}

function earliestActivityDay(subscriptions: NormalizedSubscription[], transactions: NormalizedTransaction[], today: string) {
  let earliest = today;
  for (const s of subscriptions) earliest = toDay(s.startDate) < earliest ? toDay(s.startDate) : earliest;
  for (const t of transactions) earliest = toDay(t.createdAt) < earliest ? toDay(t.createdAt) : earliest;
  return earliest;
}

async function upsertSnapshots(admin: AdminClient, connectionId: string, rows: DailySnapshot[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await admin.from("connection_revenue_snapshots").upsert(
      rows.slice(i, i + UPSERT_CHUNK).map((row) => ({
        connection_id: connectionId,
        date: row.date,
        mrr_cents: row.mrrCents,
        revenue_cents: row.revenueCents,
        revenue_total_cents: row.revenueTotalCents,
        active_subscriptions: row.activeSubscriptions,
        is_estimated: row.isEstimated,
      })),
      { onConflict: "connection_id,date" }
    );
    if (error) throw new Error(`Failed to store snapshots: ${error.message}`);
  }
}

async function loadExisting(admin: AdminClient, connectionId: string, from: string) {
  const existing = new Map<string, DailySnapshot>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from("connection_revenue_snapshots")
      .select("date, mrr_cents, revenue_cents, revenue_total_cents, active_subscriptions, is_estimated")
      .eq("connection_id", connectionId)
      .gte("date", from)
      .order("date")
      .range(offset, offset + 999);
    if (error) throw new Error(`Failed to read snapshots: ${error.message}`);
    for (const r of data) {
      existing.set(r.date, {
        date: r.date,
        mrrCents: r.mrr_cents,
        revenueCents: r.revenue_cents,
        revenueTotalCents: r.revenue_total_cents,
        activeSubscriptions: r.active_subscriptions,
        isEstimated: r.is_estimated,
      });
    }
    if (data.length < 1000) break;
  }
  return existing;
}

export async function syncConnection(connectionId: string, trigger: SyncTrigger, deadline = Date.now() + 220_000): Promise<SyncOutcome> {
  const admin = createAdminClient(deadline + 20_000);
  const startedAt = Date.now();

  const { data: previousRun, error: previousRunError } = await admin.from("sync_runs")
    .select("stats").eq("connection_id", connectionId).eq("stats->>reason", "deferred")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (previousRunError) return { status: "skipped", reason: "Could not check the retry schedule. Try again later." };
  if (retryAtFromStats(previousRun?.stats) > startedAt) {
    return { status: "skipped", reason: "The provider requested a later retry." };
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_connection_sync", {
    p_connection_id: connectionId,
    p_stale_after_seconds: LOCK_SECONDS,
  });
  if (claimError) throw new Error(`Failed to lock connection: ${claimError.message}`);
  if (!claimed) {
    await admin.from("sync_runs").insert({
      connection_id: connectionId,
      trigger,
      status: "skipped",
      finished_at: new Date().toISOString(),
      stats: { reason: "already_running" },
    });
    return { status: "skipped", reason: "A sync for this connection is already running." };
  }

  const { data: run } = await admin
    .from("sync_runs")
    .insert({ connection_id: connectionId, trigger, status: "running" })
    .select("id")
    .single();

  const { data: connection, error: connectionError } = await admin
    .from("revenue_connections")
    .select("id, startup_id, provider, encrypted_credentials, consecutive_failures, startup:startups!inner (slug)")
    .eq("id", connectionId)
    .single();
  if (connectionError || !connection) throw new Error("Connection not found.");
  const slug = connection.startup.slug;

  const stats: Record<string, number> = {};
  try {
    const provider = getRevenueProvider(connection.provider);
    if (!provider) throw new SyncFailure(`Provider ${connection.provider} is not supported yet.`, "permission");
    if (!connection.encrypted_credentials) throw new SyncFailure("This connection was disconnected.", "revoked");

    const today = toDay(new Date());
    const { data: latest } = await admin
      .from("connection_revenue_snapshots")
      .select("date")
      .eq("connection_id", connectionId)
      .lt("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Incremental when we already have history: rewind a few days and continue the total.
    let since: string | null = latest ? addDays(latest.date, -REWIND_DAYS) : null;
    let priorTotalCents = 0;
    if (since) {
      const { data: before } = await admin
        .from("connection_revenue_snapshots")
        .select("revenue_total_cents")
        .eq("connection_id", connectionId)
        .eq("date", addDays(since, -1))
        .maybeSingle();
      if (before) priorTotalCents = before.revenue_total_cents;
      else since = null; // A gap in history: fall back to a full backfill.
    }

    // The decrypted key only lives in this scope and is never logged or returned.
    const ctx = { credentials: decryptSecret(connection.encrypted_credentials, connection.id), stats, deadline };
    const subscriptions = await collect(provider.fetchSubscriptions(ctx));
    const transactions = await collect(provider.fetchTransactions(ctx, since ? new Date(`${since}T00:00:00Z`) : undefined));
    if (Date.now() >= deadline) throw new SyncFailure("The sync time budget was reached. It will be retried later.", "deferred", 60_000);

    const from = since ?? [earliestActivityDay(subscriptions, transactions, today), addDays(today, -(BACKFILL_DAYS - 1))].sort()[1];
    const fxFrom = since ?? earliestActivityDay(subscriptions, transactions, today);
    const currencies = new Set([...subscriptions.map((s) => s.currency), ...transactions.map((t) => t.currency)]);
    await ensureFxRates(admin, currencies, fxFrom, today, deadline);
    const fx = await loadFxTable(admin, currencies, fxFrom, today);

    const built = buildDailySnapshots({ subscriptions, transactions, fx, from, today, priorTotalCents });
    const snapshots = mergeWithExisting(built.snapshots, await loadExisting(admin, connectionId, from));
    if (Date.now() >= deadline) throw new SyncFailure("The sync time budget was reached. It will be retried later.", "deferred", 60_000);
    await upsertSnapshots(admin, connectionId, snapshots);

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("revenue_connections")
      .update({ status: "active", last_success_at: now, last_synced_at: now, consecutive_failures: 0, last_error: null })
      .eq("id", connectionId);
    if (updateError) throw new Error(`Failed to update connection: ${updateError.message}`);

    const { error: rollupError } = await admin.rpc("refresh_startup_revenue", { p_startup_id: connection.startup_id });
    if (rollupError) throw new Error(`Failed to refresh the startup rollup: ${rollupError.message}`);

    const todayRow = snapshots[snapshots.length - 1];
    const runStats = {
      ...stats,
      mode: since ? "incremental" : "backfill",
      days: snapshots.length,
      subscriptions: subscriptions.length,
      transactions: transactions.length,
      transactionsCounted: built.stats.transactionsCounted,
      meteredItemsSkipped: built.stats.meteredItemsSkipped,
      mrrCents: todayRow.mrrCents,
      revenueTotalCents: todayRow.revenueTotalCents,
      activeSubscriptions: todayRow.activeSubscriptions,
      durationMs: Date.now() - startedAt,
    };
    if (run) {
      await admin
        .from("sync_runs")
        .update({ status: "succeeded", finished_at: now, stats: runStats as Json })
        .eq("id", run.id);
    }

    invalidate(slug);
    return { status: "succeeded", mrrCents: todayRow.mrrCents, days: snapshots.length };
  } catch (error) {
    const failure = classifySyncFailure(error);
    const deferred = failure.kind === "deferred";
    const now = new Date().toISOString();

    await admin
      .from("revenue_connections")
      .update({
        status: failure.kind === "revoked" ? "revoked" : failure.kind === "permission" ? "error" : undefined,
        last_synced_at: now,
        last_error: deferred ? undefined : failure.message,
        consecutive_failures: deferred ? connection.consecutive_failures : connection.consecutive_failures + 1,
      })
      .eq("id", connectionId);
    await admin.rpc("refresh_verification", { p_startup_id: connection.startup_id });
    if (run) {
      await admin
        .from("sync_runs")
        .update({
          status: deferred ? "skipped" : "failed",
          finished_at: now,
          error: failure.message,
          stats: { ...stats, durationMs: Date.now() - startedAt, reason: failure.kind,
            ...(deferred ? { retryAt: new Date(Date.now() + Math.max(60_000, failure.retryAfterMs)).toISOString() } : {}) } as Json,
        })
        .eq("id", run.id);
    }

    if (!deferred) console.error(`[sync] connection ${connectionId} failed (${failure.kind}): ${failure.message}`);
    invalidate(slug);
    if (deferred) return { status: "skipped", reason: failure.message };
    return { status: "failed", error: failure.message };
  }
}

type DueOptions = {
  // Stop starting new syncs after this many milliseconds, so the function finishes in time.
  budgetMs: number;
  concurrency?: number;
  limit?: number;
};

// Cron entry point: oldest-synced first, bounded concurrency, time-boxed.
export async function syncDueConnections({ budgetMs, concurrency = 5, limit = 200 }: DueOptions) {
  const deadline = Date.now() + budgetMs;
  const admin = createAdminClient(deadline);
  const today = toDay(new Date());

  await refreshTrackedFxRates(admin, today);

  const { data: due, error } = await admin
    .from("revenue_connections")
    .select("id")
    .is("disconnected_at", null)
    .in("status", ["active", "error"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`Failed to list connections: ${error.message}`);

  const queue = [...due];
  const results: Record<SyncOutcome["status"], number> = { succeeded: 0, failed: 0, skipped: 0 };
  let notStarted = 0;

  async function worker() {
    while (queue.length > 0) {
      if (Date.now() >= deadline - 20_000) {
        notStarted = queue.length;
        queue.length = 0;
        return;
      }
      const next = queue.shift()!;
      try {
        results[(await syncConnection(next.id, "cron", deadline - 20_000)).status]++;
      } catch (e) {
        results.failed++;
        console.error(`[sync] connection ${next.id} crashed: ${redactedMessage(e)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  // Startups whose last success is now older than 72h lose their badge here.
  await admin.rpc("refresh_verification", {});
  invalidate(null);

  return { connections: due.length, ...results, notStarted };
}
