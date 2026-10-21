import { toDay } from "./dates";
import { toUsdCents } from "./fx";
import type { FxTable, NormalizedTransaction, TransactionCategory } from "./types";

// Charges in, refunds and lost disputes out; failed refunds and won disputes come back.
const REVENUE_CATEGORIES = new Set<TransactionCategory>([
  "charge",
  "refund",
  "refund_failure",
  "dispute",
  "dispute_reversal",
  "charge_failure",
  "partial_capture_reversal",
]);

export function isRevenueTransaction(transaction: NormalizedTransaction) {
  return REVENUE_CATEGORIES.has(transaction.category);
}

export type DailyRevenue = {
  // Net revenue per UTC day, in USD cents, rounded per day.
  byDay: Map<string, number>;
  transactionsCounted: number;
};

// Settlement-currency amounts converted at each transaction's own day.
export function dailyRevenue(transactions: Iterable<NormalizedTransaction>, fx: FxTable): DailyRevenue {
  const raw = new Map<string, number>();
  let transactionsCounted = 0;

  for (const transaction of transactions) {
    if (!isRevenueTransaction(transaction)) continue;
    const day = toDay(transaction.createdAt);
    raw.set(day, (raw.get(day) ?? 0) + toUsdCents(transaction.amount, transaction.currency, fx, day));
    transactionsCounted++;
  }

  const byDay = new Map<string, number>();
  for (const [day, cents] of raw) byDay.set(day, Math.round(cents));
  return { byDay, transactionsCounted };
}

export function sumRevenueBefore(byDay: Map<string, number>, day: string) {
  let total = 0;
  for (const [d, cents] of byDay) if (d < day) total += cents;
  return total;
}
