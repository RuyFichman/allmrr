import { describe, expect, it } from "vitest";
import subscriptionFixtures from "./__fixtures__/subscriptions.json";
import transactionFixtures from "./__fixtures__/transactions.json";
import { MissingFxRateError, buildFxTable, toUsdCents, usdRateOn } from "./fx";
import { growth30d, growthPct } from "./growth";
import { computeMrr, isCountedOn } from "./mrr";
import { dailyRevenue } from "./revenue";
import { buildDailySnapshots, mergeWithExisting } from "./snapshots";
import type { DailySnapshot, FxTable, NormalizedSubscription, NormalizedTransaction } from "./types";

type FixtureName = keyof typeof subscriptionFixtures.subscriptions;

const TODAY = "2026-10-21";

const fx: FxTable = buildFxTable([
  { date: "2026-10-01", currency: "BRL", usd_rate: 0.2 },
  { date: "2026-10-01", currency: "JPY", usd_rate: 0.0067 },
  { date: "2026-10-02", currency: "EUR", usd_rate: 1.1 },
  { date: "2026-10-05", currency: "EUR", usd_rate: 1.2 },
]);

function subscription(name: FixtureName): NormalizedSubscription {
  const { defaults, itemDefaults, subscriptions } = subscriptionFixtures;
  const raw = subscriptions[name] as Partial<NormalizedSubscription> & { items: Array<Partial<NormalizedSubscription["items"][number]>> };
  return {
    ...defaults,
    ...raw,
    id: `sub_${name}`,
    items: raw.items.map((item, i) => ({ ...itemDefaults, ...item, id: item.id ?? `si_${name}_${i}` })),
  } as NormalizedSubscription;
}

function mrrOf(...names: FixtureName[]) {
  return computeMrr(names.map(subscription), { day: TODAY, fx, mode: "current" });
}

const transactions = transactionFixtures as NormalizedTransaction[];

describe("MRR normalization", () => {
  it.each<[FixtureName, number]>([
    ["monthly", 2900],
    ["annual", 10000],
    ["weekly", 4333],
    ["daily", 3044],
    ["quarterly", 3000],
    ["quantity", 5000],
    ["decimalUnitAmount", 500],
    ["transformQuantity", 3000],
  ])("%s", (name, expected) => {
    expect(mrrOf(name).mrrCents).toBe(expected);
  });

  it("rounds only once, at the end", () => {
    // 3 × 4333.33… = 13000 exactly; rounding per subscription would give 12999.
    const weekly = subscription("weekly");
    const result = computeMrr([weekly, { ...weekly, id: "b" }, { ...weekly, id: "c" }], { day: TODAY, fx, mode: "current" });
    expect(result.mrrCents).toBe(13000);
  });
});

describe("tiered prices", () => {
  it("graduated tiers bill each band, flat fees included", () => {
    expect(mrrOf("graduated").mrrCents).toBe(10 * 500 + 1000 + 5 * 300);
  });

  it("volume tiers bill every unit at the reached tier", () => {
    expect(mrrOf("volume").mrrCents).toBe(15 * 300 + 2000);
  });
});

describe("discounts", () => {
  it.each<[FixtureName, number]>([
    ["percentCoupon", 8000],
    ["amountCoupon", 4000],
    ["amountCouponAnnual", 8000],
    ["expiredCoupon", 5000],
    ["onceCoupon", 5000],
    ["wrongCurrencyCoupon", 5000],
    ["itemLevelCoupon", 3500],
  ])("%s", (name, expected) => {
    expect(mrrOf(name).mrrCents).toBe(expected);
  });

  it("applies a coupon while it was active, in reconstructed history", () => {
    const sub = subscription("expiredCoupon");
    expect(computeMrr([sub], { day: "2026-03-01", fx, mode: "historical" }).mrrCents).toBe(2500);
    expect(computeMrr([sub], { day: "2026-05-01", fx, mode: "historical" }).mrrCents).toBe(5000);
  });
});

describe("statuses", () => {
  it("counts active, past_due and cancel_at_period_end", () => {
    expect(mrrOf("pastDue", "cancelAtPeriodEnd")).toMatchObject({ mrrCents: 4900 + 1900, activeSubscriptions: 2 });
  });

  it.each<FixtureName>(["trialing", "canceled", "incomplete", "unpaid", "paused"])("excludes %s", (name) => {
    expect(mrrOf(name)).toMatchObject({ mrrCents: 0, activeSubscriptions: 0 });
  });

  it("reconstructs history from start, end and trial dates", () => {
    const canceled = subscription("canceled");
    expect(isCountedOn(canceled, "2026-05-31")).toBe(true);
    expect(isCountedOn(canceled, "2026-06-01")).toBe(false);
    expect(isCountedOn(subscription("trialing"), "2026-10-20")).toBe(false);
    expect(isCountedOn(subscription("monthly"), "2026-01-09")).toBe(false);
    expect(isCountedOn(subscription("incomplete"), "2026-05-01")).toBe(false);
  });
});

describe("multi-currency", () => {
  it("converts BRL, EUR and zero-decimal JPY to USD cents", () => {
    expect(mrrOf("brl").mrrCents).toBe(2000);
    expect(mrrOf("eurAnnual").mrrCents).toBe(6000);
    expect(mrrOf("jpy").mrrCents).toBe(1005);
  });

  it("falls back to the nearest previous rate and fails without one", () => {
    expect(usdRateOn(fx, "EUR", "2026-10-04")).toBe(1.1);
    expect(usdRateOn(fx, "usd", "1999-01-01")).toBe(1);
    expect(() => usdRateOn(fx, "EUR", "2026-10-01")).toThrow(MissingFxRateError);
    expect(() => toUsdCents(100, "GBP", fx, TODAY)).toThrow(MissingFxRateError);
  });
});

describe("metered items", () => {
  it("skips metered items in MRR and reports how many", () => {
    expect(mrrOf("withMetered")).toMatchObject({ mrrCents: 2000, meteredItemsSkipped: 1 });
  });
});

describe("zero-MRR account", () => {
  it("returns zero without failing", () => {
    expect(computeMrr([], { day: TODAY, fx, mode: "current" })).toEqual({
      mrrCents: 0,
      activeSubscriptions: 0,
      meteredItemsSkipped: 0,
    });
    expect(mrrOf("onlyMetered").mrrCents).toBe(0);
  });
});

describe("revenue", () => {
  it("nets charges, refunds and lost disputes, gross of fees", () => {
    const { byDay, transactionsCounted } = dailyRevenue(transactions, fx);
    expect(Object.fromEntries(byDay)).toEqual({
      "2026-10-01": 15000,
      "2026-10-02": -2500,
      "2026-10-03": -8000,
      // A won dispute and a failed refund come back; Sunday EUR uses Friday's rate.
      "2026-10-04": 3000 + 1000 + 2200,
      "2026-10-05": 12000,
    });
    expect(transactionsCounted).toBe(9);
  });
});

describe("daily snapshots", () => {
  const monthly = subscription("monthly");

  it("builds exact revenue, cumulative totals and estimated history", () => {
    const { snapshots } = buildDailySnapshots({
      subscriptions: [monthly],
      transactions,
      fx,
      from: "2026-10-03",
      today: "2026-10-05",
    });
    expect(snapshots).toEqual([
      { date: "2026-10-03", mrrCents: 2900, revenueCents: -8000, revenueTotalCents: 4500, activeSubscriptions: 1, isEstimated: true },
      { date: "2026-10-04", mrrCents: 2900, revenueCents: 6200, revenueTotalCents: 10700, activeSubscriptions: 1, isEstimated: true },
      { date: "2026-10-05", mrrCents: 2900, revenueCents: 12000, revenueTotalCents: 22700, activeSubscriptions: 1, isEstimated: false },
    ]);
  });

  it("continues from a prior total on incremental syncs", () => {
    const recent = transactions.filter((t) => t.createdAt >= "2026-10-05");
    const { snapshots } = buildDailySnapshots({
      subscriptions: [monthly],
      transactions: recent,
      fx,
      from: "2026-10-05",
      today: "2026-10-05",
      priorTotalCents: 10700,
    });
    expect(snapshots[0].revenueTotalCents).toBe(22700);
  });

  it("keeps MRR observed by earlier syncs instead of the reconstruction", () => {
    const observed: DailySnapshot = {
      date: "2026-10-04",
      mrrCents: 3100,
      revenueCents: 0,
      revenueTotalCents: 0,
      activeSubscriptions: 2,
      isEstimated: false,
    };
    const fresh = buildDailySnapshots({ subscriptions: [monthly], transactions, fx, from: "2026-10-04", today: "2026-10-05" })
      .snapshots;
    const merged = mergeWithExisting(fresh, new Map([[observed.date, observed]]));
    expect(merged[0]).toMatchObject({ mrrCents: 3100, activeSubscriptions: 2, isEstimated: false, revenueCents: 6200 });
    expect(merged[1]).toMatchObject({ mrrCents: 2900, isEstimated: false });
  });
});

describe("growth", () => {
  it("is relative to the base and null without one", () => {
    expect(growthPct(11000, 10000)).toBeCloseTo(10);
    expect(growthPct(9000, 10000)).toBeCloseTo(-10);
    expect(growthPct(5000, 0)).toBeNull();
    expect(growthPct(null, 100)).toBeNull();
  });

  it("compares today with the latest day at least 30 days back", () => {
    const rows = [
      { date: "2026-09-15", mrrCents: 8000 },
      { date: "2026-09-21", mrrCents: 10000 },
      { date: "2026-10-01", mrrCents: 10500 },
      { date: TODAY, mrrCents: 12000 },
    ];
    expect(growth30d(rows, TODAY)).toBeCloseTo(20);
    expect(growth30d([{ date: TODAY, mrrCents: 12000 }], TODAY)).toBeNull();
    expect(growth30d([{ date: "2026-09-01", mrrCents: 0 }, { date: TODAY, mrrCents: 500 }], TODAY)).toBeNull();
  });
});
