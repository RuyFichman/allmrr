import { endOfDay } from "./dates";
import { toUsdCents } from "./fx";
import type { BillingInterval, FxTable, NormalizedDiscount, NormalizedItem, NormalizedSubscription } from "./types";

// Months per billing interval, before dividing by interval_count.
const MONTHLY_FACTOR: Record<BillingInterval, number> = {
  day: 365.25 / 12,
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

const COUNTED_NOW = new Set(["active", "past_due"]);
// Never paid, so never revenue, at any point in history.
const NEVER_COUNTED = new Set(["incomplete", "incomplete_expired"]);

export function toMonthly(amount: number, interval: BillingInterval, intervalCount: number) {
  return (amount * MONTHLY_FACTOR[interval]) / intervalCount;
}

function billableQuantity(item: NormalizedItem) {
  const { quantity, transformQuantity } = item;
  if (!transformQuantity) return quantity;
  const divided = quantity / transformQuantity.divideBy;
  return transformQuantity.round === "up" ? Math.ceil(divided) : Math.floor(divided);
}

// Amount billed per interval for a licensed item, in minor units, before discounts.
export function itemAmountPerInterval(item: NormalizedItem) {
  const quantity = billableQuantity(item);
  if (item.billingScheme === "per_unit") return (item.unitAmount ?? 0) * quantity;

  if (item.tiersMode === "volume") {
    const tier = item.tiers.find((t) => t.upTo === null || quantity <= t.upTo) ?? item.tiers.at(-1);
    return tier ? tier.unitAmount * quantity + tier.flatAmount : 0;
  }

  // Graduated: each tier bills the units that fall inside it.
  let total = 0;
  let previousUpTo = 0;
  for (const tier of item.tiers) {
    const ceiling = tier.upTo ?? Infinity;
    const units = Math.min(quantity, ceiling) - previousUpTo;
    if (units <= 0) break;
    total += units * tier.unitAmount + tier.flatAmount;
    previousUpTo = ceiling;
  }
  return total;
}

// `once` coupons only touch the first invoice, so they never change recurring revenue.
export function isDiscountActive(discount: NormalizedDiscount, at: string) {
  if (discount.duration === "once") return false;
  return discount.start <= at && (discount.end === null || at < discount.end);
}

// Applies discounts in order to a monthly amount. Amount-off coupons are per invoice,
// so they are normalized by the same interval as the amount they reduce.
function applyDiscounts(
  monthly: number,
  discounts: NormalizedDiscount[],
  at: string,
  currency: string,
  interval: BillingInterval,
  intervalCount: number
) {
  let amount = monthly;
  for (const discount of discounts) {
    if (!isDiscountActive(discount, at)) continue;
    if (discount.percentOff !== null) {
      amount *= 1 - discount.percentOff / 100;
    } else if (discount.amountOff !== null && discount.currency?.toUpperCase() === currency.toUpperCase()) {
      amount -= toMonthly(discount.amountOff, interval, intervalCount);
    }
  }
  return Math.max(0, amount);
}

export type SubscriptionMrr = {
  // Monthly recurring amount in the subscription's currency, minor units, unrounded.
  monthlyMinor: number;
  meteredItemsSkipped: number;
};

export function subscriptionMonthlyAmount(subscription: NormalizedSubscription, at: string): SubscriptionMrr {
  let monthlyMinor = 0;
  let meteredItemsSkipped = 0;
  let reference: NormalizedItem | null = null;

  for (const item of subscription.items) {
    if (item.usageType === "metered") {
      meteredItemsSkipped++;
      continue;
    }
    const monthly = toMonthly(itemAmountPerInterval(item), item.interval, item.intervalCount);
    monthlyMinor += applyDiscounts(monthly, item.discounts, at, subscription.currency, item.interval, item.intervalCount);
    reference ??= item;
  }

  // Subscription-level discounts apply to the whole invoice, billed on the items' cadence.
  if (reference && monthlyMinor > 0) {
    monthlyMinor = applyDiscounts(
      monthlyMinor,
      subscription.discounts,
      at,
      subscription.currency,
      reference.interval,
      reference.intervalCount
    );
  }
  return { monthlyMinor, meteredItemsSkipped };
}

// Current MRR counts active and past_due subscriptions (cancel_at_period_end included).
export function isCountedNow(subscription: NormalizedSubscription) {
  return COUNTED_NOW.has(subscription.status);
}

// Reconstructed history: alive and out of trial at the end of `day`. Current statuses
// are unknown for past days, so this is an estimate (see docs/revenue-methodology.md).
export function isCountedOn(subscription: NormalizedSubscription, day: string) {
  if (NEVER_COUNTED.has(subscription.status)) return false;
  const at = endOfDay(day);
  if (subscription.startDate > at) return false;
  if (subscription.endedAt !== null && subscription.endedAt <= at) return false;
  if (subscription.trialEnd !== null && subscription.trialEnd > at) return false;
  return true;
}

export type MrrResult = {
  mrrCents: number;
  activeSubscriptions: number;
  meteredItemsSkipped: number;
};

type MrrOptions = {
  day: string;
  fx: FxTable;
  // "current" uses today's statuses; "historical" reconstructs from start/end/trial dates.
  mode: "current" | "historical";
};

export function computeMrr(subscriptions: NormalizedSubscription[], { day, fx, mode }: MrrOptions): MrrResult {
  const at = endOfDay(day);
  let usdCents = 0;
  let activeSubscriptions = 0;
  let meteredItemsSkipped = 0;

  for (const subscription of subscriptions) {
    const counted = mode === "current" ? isCountedNow(subscription) : isCountedOn(subscription, day);
    if (!counted) continue;

    const { monthlyMinor, meteredItemsSkipped: skipped } = subscriptionMonthlyAmount(subscription, at);
    meteredItemsSkipped += skipped;
    activeSubscriptions++;
    if (monthlyMinor > 0) usdCents += toUsdCents(monthlyMinor, subscription.currency, fx, day);
  }

  // Round once, at the end.
  return { mrrCents: Math.round(usdCents), activeSubscriptions, meteredItemsSkipped };
}
