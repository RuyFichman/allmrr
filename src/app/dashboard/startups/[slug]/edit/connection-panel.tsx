"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeUtc, formatPercent, formatUsd } from "@/lib/format";
import { disconnectStripe, syncStripeNow, type RevenueActionState } from "../../revenue-actions";

export type ConnectionView = {
  keyLast4: string | null;
  status: "active" | "error" | "revoked";
  hasAccountId: boolean;
  syncing: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  connectedAt: string;
  run: {
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    stats: Record<string, number | string>;
    error: string | null;
  } | null;
  preview: {
    date: string;
    mrrCents: number;
    revenueTotalCents: number;
    activeSubscriptions: number;
    growth30dPct: number | null;
    hasEstimatedHistory: boolean;
  } | null;
};

const POLL_MS = 4000;

export function ConnectionPanel({ startupId, connection }: { startupId: string; connection: ConnectionView }) {
  const router = useRouter();
  const [syncState, syncAction, syncPending] = useActionState<RevenueActionState>(syncStripeNow.bind(null, startupId), {});
  const [disconnectState, disconnectAction, disconnectPending] = useActionState<RevenueActionState>(
    disconnectStripe.bind(null, startupId),
    {}
  );
  const [confirming, setConfirming] = useState(false);

  // While a background sync runs (or was just requested), refresh until it finishes.
  const polling = connection.syncing || syncState.ok === true;
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    const stop = setTimeout(() => clearInterval(id), 5 * 60 * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [polling, router]);

  useEffect(() => {
    if (disconnectState.ok) router.refresh();
  }, [disconnectState, router]);

  const status = connection.syncing
    ? { label: "Syncing…", variant: "secondary" as const }
    : connection.status === "active"
      ? { label: "Active", variant: "default" as const }
      : connection.status === "error"
        ? { label: "Needs attention", variant: "destructive" as const }
        : { label: "Key revoked", variant: "destructive" as const };

  const stats = connection.run?.stats ?? {};

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Stripe</span>
        {connection.keyLast4 && <span className="font-mono text-sm text-muted-foreground">rk_••••{connection.keyLast4}</span>}
        <Badge variant={status.variant}>
          {connection.syncing && <RefreshCwIcon data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
          {status.label}
        </Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Last successful sync</dt>
          <dd>{connection.lastSuccessAt ? formatDateTimeUtc(connection.lastSuccessAt) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Connected</dt>
          <dd>{formatDateTimeUtc(connection.connectedAt)}</dd>
        </div>
      </dl>

      {connection.lastError && !connection.syncing && (
        <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {connection.lastError}
        </p>
      )}

      {!connection.hasAccountId && (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm">
          Tip: add <strong>Core → Accounts: Read</strong> to the key and reconnect, so this Stripe account can only verify
          this startup.
        </p>
      )}

      {connection.preview ? (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="MRR" value={formatUsd(connection.preview.mrrCents)} />
            <Metric label="Total revenue" value={formatUsd(connection.preview.revenueTotalCents)} />
            <Metric
              label="30-day growth"
              value={connection.preview.growth30dPct === null ? "—" : formatPercent(connection.preview.growth30dPct)}
            />
            <Metric label="Active subscriptions" value={String(connection.preview.activeSubscriptions)} />
          </dl>
          <p className="text-xs text-muted-foreground">
            Figures in USD as of {connection.preview.date}.
            {connection.preview.hasEstimatedHistory &&
              " MRR before the connection date is estimated from current subscription prices; revenue totals are exact."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {connection.syncing ? "Your first sync is running. This page updates when it finishes." : "No revenue data yet."}
        </p>
      )}

      {connection.run && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Latest sync run</summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <RunStat label="Result" value={connection.run.status} />
            <RunStat label="Trigger" value={connection.run.trigger} />
            <RunStat label="Mode" value={stats.mode} />
            <RunStat label="Subscriptions" value={stats.subscriptions} />
            <RunStat label="Transactions" value={stats.transactions} />
            <RunStat label="Metered items skipped" value={stats.meteredItemsSkipped} />
            <RunStat label="Days written" value={stats.days} />
            <RunStat
              label="Duration"
              value={typeof stats.durationMs === "number" ? `${(stats.durationMs / 1000).toFixed(1)}s` : undefined}
            />
            <RunStat label="Started" value={formatDateTimeUtc(connection.run.startedAt)} />
          </dl>
        </details>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form action={syncAction}>
          <Button type="submit" variant="outline" disabled={syncPending || connection.syncing} className="w-full sm:w-auto">
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            {syncPending ? "Starting…" : "Sync now"}
          </Button>
        </form>

        {/* Two-step confirmation without a browser dialog. */}
        {confirming ? (
          <form action={disconnectAction} className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="destructive" disabled={disconnectPending}>
              {disconnectPending ? "Disconnecting…" : "Yes, delete the key"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="text-destructive">
            Disconnect
          </Button>
        )}
      </div>
      {confirming && !disconnectState.ok && (
        <p className="text-sm text-muted-foreground">
          This deletes the stored key immediately. Past snapshots stay, but the startup loses its Verified badge.
        </p>
      )}

      <div aria-live="polite" className="text-sm">
        {syncState.error && <p className="text-destructive">{syncState.error}</p>}
        {syncState.ok && syncState.message && <p className="text-emerald-700 dark:text-emerald-400">{syncState.message}</p>}
        {disconnectState.error && <p className="text-destructive">{disconnectState.error}</p>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function RunStat({ label, value }: { label: string; value: number | string | undefined }) {
  if (value === undefined) return null;
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
