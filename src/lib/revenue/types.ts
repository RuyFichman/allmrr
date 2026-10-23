// Provider-agnostic shapes. Adapters (src/lib/revenue/providers/*) map provider objects into
// these; everything in src/lib/revenue/*.ts works on them only and stays pure.
// Timestamps are ISO 8601 strings in UTC, days are "YYYY-MM-DD", money is in the currency's
// minor unit (cents for USD, whole yen for JPY) and may be fractional (decimal unit prices).

export type BillingInterval = "day" | "week" | "month" | "year";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "canceled"
  | "paused";

export type NormalizedDiscount = {
  percentOff: number | null;
  // Per invoice, in `currency` minor units. Already resolved to the subscription's currency.
  amountOff: number | null;
  currency: string | null;
  duration: "forever" | "once" | "repeating";
  start: string;
  end: string | null;
};

export type PriceTier = {
  upTo: number | null;
  unitAmount: number;
  flatAmount: number;
};

export type NormalizedItem = {
  id: string;
  quantity: number;
  usageType: "licensed" | "metered";
  interval: BillingInterval;
  intervalCount: number;
  billingScheme: "per_unit" | "tiered";
  unitAmount: number | null;
  tiersMode: "graduated" | "volume" | null;
  tiers: PriceTier[];
  transformQuantity: { divideBy: number; round: "up" | "down" } | null;
  discounts: NormalizedDiscount[];
};

export type NormalizedSubscription = {
  id: string;
  status: SubscriptionStatus;
  currency: string;
  startDate: string;
  trialStart: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  cancelAtPeriodEnd: boolean;
  items: NormalizedItem[];
  discounts: NormalizedDiscount[];
};

// Balance-transaction categories that move revenue. Everything else (payouts, fees,
// transfers, top-ups…) maps to "other" and is ignored.
export type TransactionCategory =
  | "charge"
  | "refund"
  | "refund_failure"
  | "dispute"
  | "dispute_reversal"
  | "charge_failure"
  | "partial_capture_reversal"
  | "other";

export type NormalizedTransaction = {
  id: string;
  createdAt: string;
  // Signed, gross of processor fees, in the account's settlement currency.
  amount: number;
  currency: string;
  category: TransactionCategory;
};

// 1 unit of `currency` = rate USD, keyed by currency, sorted by day ascending.
export type FxTable = Record<string, Array<[day: string, usdRate: number]>>;

export type DailySnapshot = {
  date: string;
  mrrCents: number;
  revenueCents: number;
  revenueTotalCents: number;
  activeSubscriptions: number;
  isEstimated: boolean;
};

export type ValidationResult =
  | { ok: true; accountId: string | null; missingOptional: string[]; livemode: boolean }
  | { ok: false; reason: "invalid_key" | "wrong_key_type" | "test_key_not_allowed" | "missing_permissions" | "unreachable"; message: string; missing?: string[] };

export type ProviderContext = {
  credentials: string;
  // Shared by every page/request in a sync, including retries.
  deadline?: number;
  // Counters the adapter increments (skipped items, unresolved coupons…), stored in sync_runs.
  stats: Record<string, number>;
};

export interface RevenueProvider {
  validateCredentials(key: string): Promise<ValidationResult>;
  fetchSubscriptions(ctx: ProviderContext): AsyncIterable<NormalizedSubscription>;
  fetchTransactions(ctx: ProviderContext, since?: Date): AsyncIterable<NormalizedTransaction>;
}
