import type Stripe from "stripe";
import type {
  NormalizedDiscount,
  NormalizedItem,
  NormalizedSubscription,
  NormalizedTransaction,
  SubscriptionStatus,
  TransactionCategory,
} from "../types";

// Pure Stripe -> normalized mapping, kept apart from the network code so it can be tested.

export const STRIPE_KEY_PATTERN = /^(rk|sk|pk)_(live|test)_[A-Za-z0-9]+$/;

export type KeyCheck =
  | { ok: true; livemode: boolean }
  | { ok: false; reason: "invalid_key" | "wrong_key_type" | "test_key_not_allowed"; message: string };

export function classifyStripeKey(raw: string, allowTestKeys: boolean): KeyCheck {
  const key = raw.trim();
  const match = STRIPE_KEY_PATTERN.exec(key);
  if (!match) {
    return { ok: false, reason: "invalid_key", message: "That doesn't look like a Stripe API key." };
  }
  const [, kind, mode] = match;
  if (kind === "sk") {
    return {
      ok: false,
      reason: "wrong_key_type",
      message:
        "That is a secret key with full write access. AllMRR only accepts restricted keys (rk_…) with read-only permissions, so we can never change anything in your account.",
    };
  }
  if (kind === "pk") {
    return {
      ok: false,
      reason: "wrong_key_type",
      message: "That is a publishable key, which can't read revenue data. Create a restricted key (rk_…) instead.",
    };
  }
  if (mode === "test" && !allowTestKeys) {
    return {
      ok: false,
      reason: "test_key_not_allowed",
      message: "Test-mode keys can't verify real revenue. Use a live restricted key (rk_live_…).",
    };
  }
  return { ok: true, livemode: mode === "live" };
}

export function keyLast4(key: string) {
  return key.trim().slice(-4);
}

const iso = (seconds: number | null | undefined) => (seconds == null ? null : new Date(seconds * 1000).toISOString());

// Stripe's Decimal fields stringify to plain decimal strings.
function decimal(value: { toString(): string } | string | number | null | undefined, fallback: number | null) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : fallback;
}

const STATUSES = new Set<SubscriptionStatus>([
  "active",
  "past_due",
  "trialing",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
  "paused",
]);

export function mapStatus(status: string): SubscriptionStatus {
  // Unknown future statuses are treated as not revenue-generating.
  return STATUSES.has(status as SubscriptionStatus) ? (status as SubscriptionStatus) : "incomplete";
}

export function mapCoupon(
  coupon: Pick<Stripe.Coupon, "percent_off" | "amount_off" | "currency" | "duration"> & {
    currency_options?: Record<string, { amount_off: number }> | null;
  },
  discount: Pick<Stripe.Discount, "start" | "end">,
  subscriptionCurrency: string
): NormalizedDiscount {
  let amountOff = coupon.amount_off;
  let currency = coupon.currency;
  // Multi-currency coupons carry per-currency amounts.
  if (amountOff !== null && currency?.toLowerCase() !== subscriptionCurrency.toLowerCase()) {
    const option = coupon.currency_options?.[subscriptionCurrency.toLowerCase()];
    if (option) {
      amountOff = option.amount_off;
      currency = subscriptionCurrency;
    }
  }
  return {
    percentOff: coupon.percent_off,
    amountOff,
    currency: currency?.toUpperCase() ?? null,
    duration: coupon.duration === "once" ? "once" : coupon.duration === "repeating" ? "repeating" : "forever",
    start: iso(discount.start)!,
    end: iso(discount.end),
  };
}

type PriceLike = Pick<
  Stripe.Price,
  "id" | "billing_scheme" | "unit_amount" | "tiers_mode" | "transform_quantity" | "recurring" | "currency"
> & {
  unit_amount_decimal?: { toString(): string } | string | null;
  tiers?: Array<{
    up_to: number | null;
    unit_amount: number | null;
    unit_amount_decimal?: { toString(): string } | string | null;
    flat_amount: number | null;
    flat_amount_decimal?: { toString(): string } | string | null;
  }>;
  currency_options?: Record<string, {
    unit_amount: number | null;
    unit_amount_decimal?: { toString(): string } | string | null;
    tiers?: PriceLike["tiers"];
  }>;
};

// Currency options are prices, not exchange rates. Never reuse the default amount
// when a subscription bills in a different currency.
export function priceInCurrency(price: PriceLike, currency: string): PriceLike {
  if (price.currency.toLowerCase() === currency.toLowerCase()) return price;
  const option = price.currency_options?.[currency.toLowerCase()];
  if (!option || (price.billing_scheme === "tiered"
    ? !option.tiers?.length
    : decimal(option.unit_amount_decimal, option.unit_amount) === null)) {
    throw new Error("Stripe did not return the price in the subscription currency. Revenue was not updated.");
  }
  return { ...price, currency: currency.toLowerCase(), unit_amount: option.unit_amount,
    unit_amount_decimal: option.unit_amount_decimal, tiers: option.tiers };
}

export function mapItem(
  item: { id: string; quantity?: number; price: PriceLike },
  discounts: NormalizedDiscount[],
  currency = item.price.currency
): NormalizedItem {
  const price = priceInCurrency(item.price, currency);
  const recurring = price.recurring;
  return {
    id: item.id,
    quantity: item.quantity ?? 1,
    // One-off prices on a subscription aren't recurring revenue; treat them like metered usage.
    usageType: recurring && recurring.usage_type !== "metered" ? "licensed" : "metered",
    interval: (recurring?.interval ?? "month") as NormalizedItem["interval"],
    intervalCount: recurring?.interval_count ?? 1,
    billingScheme: price.billing_scheme === "tiered" ? "tiered" : "per_unit",
    unitAmount: decimal(price.unit_amount_decimal, price.unit_amount),
    tiersMode: price.tiers_mode === "graduated" ? "graduated" : price.tiers_mode === "volume" ? "volume" : null,
    tiers: (price.tiers ?? []).map((tier) => ({
      upTo: tier.up_to,
      unitAmount: decimal(tier.unit_amount_decimal, tier.unit_amount) ?? 0,
      flatAmount: decimal(tier.flat_amount_decimal, tier.flat_amount) ?? 0,
    })),
    transformQuantity: price.transform_quantity
      ? { divideBy: price.transform_quantity.divide_by, round: price.transform_quantity.round === "up" ? "up" : "down" }
      : null,
    discounts,
  };
}

export function mapSubscriptionShell(
  subscription: Pick<
    Stripe.Subscription,
    "id" | "status" | "currency" | "start_date" | "trial_start" | "trial_end" | "canceled_at" | "ended_at" | "cancel_at_period_end"
  >,
  items: NormalizedItem[],
  discounts: NormalizedDiscount[]
): NormalizedSubscription {
  return {
    id: subscription.id,
    status: mapStatus(subscription.status),
    currency: subscription.currency.toUpperCase(),
    startDate: iso(subscription.start_date)!,
    trialStart: iso(subscription.trial_start),
    trialEnd: iso(subscription.trial_end),
    canceledAt: iso(subscription.canceled_at),
    endedAt: iso(subscription.ended_at),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    items,
    discounts,
  };
}

const CATEGORIES = new Set<TransactionCategory>([
  "charge",
  "refund",
  "refund_failure",
  "dispute",
  "dispute_reversal",
  "charge_failure",
  "partial_capture_reversal",
]);

export function mapBalanceTransaction(
  transaction: Pick<Stripe.BalanceTransaction, "id" | "created" | "amount" | "currency" | "reporting_category">
): NormalizedTransaction {
  const category = CATEGORIES.has(transaction.reporting_category as TransactionCategory)
    ? (transaction.reporting_category as TransactionCategory)
    : "other";
  return {
    id: transaction.id,
    createdAt: iso(transaction.created)!,
    amount: transaction.amount,
    currency: transaction.currency.toUpperCase(),
    category,
  };
}
