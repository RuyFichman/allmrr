import { eachDay } from "./dates";
import { computeMrr } from "./mrr";
import { dailyRevenue, sumRevenueBefore } from "./revenue";
import type { DailySnapshot, FxTable, NormalizedSubscription, NormalizedTransaction } from "./types";

export type BuildSnapshotsInput = {
  subscriptions: NormalizedSubscription[];
  transactions: NormalizedTransaction[];
  fx: FxTable;
  from: string;
  today: string;
  // Revenue booked before the earliest transaction passed in (incremental syncs).
  priorTotalCents?: number;
};

export type BuildSnapshotsResult = {
  snapshots: DailySnapshot[];
  stats: {
    transactionsCounted: number;
    meteredItemsSkipped: number;
  };
};

// One row per day in [from, today]. Today's MRR is exact (current statuses); earlier days
// are reconstructed and flagged as estimated. Revenue is exact on every day.
export function buildDailySnapshots(input: BuildSnapshotsInput): BuildSnapshotsResult {
  const { subscriptions, transactions, fx, from, today, priorTotalCents = 0 } = input;
  const revenue = dailyRevenue(transactions, fx);

  let total = priorTotalCents + sumRevenueBefore(revenue.byDay, from);
  let meteredItemsSkipped = 0;
  const snapshots: DailySnapshot[] = [];

  for (const day of eachDay(from, today)) {
    const isToday = day === today;
    const mrr = computeMrr(subscriptions, { day, fx, mode: isToday ? "current" : "historical" });
    if (isToday) meteredItemsSkipped = mrr.meteredItemsSkipped;

    const revenueCents = revenue.byDay.get(day) ?? 0;
    total += revenueCents;
    snapshots.push({
      date: day,
      mrrCents: mrr.mrrCents,
      revenueCents,
      revenueTotalCents: total,
      activeSubscriptions: mrr.activeSubscriptions,
      isEstimated: !isToday,
    });
  }

  return { snapshots, stats: { transactionsCounted: revenue.transactionsCounted, meteredItemsSkipped } };
}

// Keeps MRR already observed by an earlier sync instead of overwriting it with a
// reconstruction; revenue columns always take the fresh values.
export function mergeWithExisting(fresh: DailySnapshot[], existing: Map<string, DailySnapshot>) {
  return fresh.map((row) => {
    const previous = existing.get(row.date);
    if (!previous || previous.isEstimated || !row.isEstimated) return row;
    return {
      ...row,
      mrrCents: previous.mrrCents,
      activeSubscriptions: previous.activeSubscriptions,
      isEstimated: false,
    };
  });
}
