import { describe, expect, it } from "vitest";
import {
  classifyStripeKey,
  keyLast4,
  mapBalanceTransaction,
  mapCoupon,
  mapItem,
  mapStatus,
  mapSubscriptionShell,
} from "./stripe-mapping";

describe("classifyStripeKey", () => {
  it("accepts live restricted keys", () => {
    expect(classifyStripeKey(" rk_live_abc123 ", false)).toEqual({ ok: true, livemode: true });
  });

  it("accepts test restricted keys only when allowed", () => {
    expect(classifyStripeKey("rk_test_abc123", true)).toEqual({ ok: true, livemode: false });
    expect(classifyStripeKey("rk_test_abc123", false)).toMatchObject({ ok: false, reason: "test_key_not_allowed" });
  });

  it("rejects secret and publishable keys with an explanation", () => {
    const secret = classifyStripeKey("sk_live_abc123", true);
    expect(secret).toMatchObject({ ok: false, reason: "wrong_key_type" });
    expect(!secret.ok && secret.message).toContain("write access");
    expect(classifyStripeKey("pk_live_abc123", true)).toMatchObject({ ok: false, reason: "wrong_key_type" });
  });

  it("rejects anything else", () => {
    expect(classifyStripeKey("whsec_abc", true)).toMatchObject({ ok: false, reason: "invalid_key" });
    expect(classifyStripeKey("rk_live_abc 123", true)).toMatchObject({ ok: false, reason: "invalid_key" });
  });

  it("keeps only the last four characters for display", () => {
    expect(keyLast4("rk_live_abcdWXYZ")).toBe("WXYZ");
  });
});

describe("Stripe mapping", () => {
  const discountTimes = { start: 1767225600, end: null };

  it("maps percent and multi-currency amount coupons", () => {
    expect(mapCoupon({ percent_off: 20, amount_off: null, currency: null, duration: "forever" }, discountTimes, "usd")).toMatchObject({
      percentOff: 20,
      amountOff: null,
      duration: "forever",
      start: "2026-01-01T00:00:00.000Z",
    });
    expect(
      mapCoupon(
        { percent_off: null, amount_off: 1000, currency: "usd", duration: "repeating", currency_options: { brl: { amount_off: 5000 } } },
        { start: 1767225600, end: 1798761600 },
        "brl"
      )
    ).toMatchObject({ amountOff: 5000, currency: "BRL", duration: "repeating", end: "2027-01-01T00:00:00.000Z" });
  });

  it("maps decimal, tiered and metered prices", () => {
    const decimal = mapItem(
      {
        id: "si_1",
        quantity: 3,
        price: {
          id: "price_1",
          currency: "usd",
          billing_scheme: "per_unit",
          unit_amount: null,
          unit_amount_decimal: "0.75",
          tiers_mode: null,
          transform_quantity: null,
          recurring: { interval: "month", interval_count: 1, usage_type: "licensed", meter: null, trial_period_days: null },
        },
      },
      []
    );
    expect(decimal).toMatchObject({ unitAmount: 0.75, quantity: 3, usageType: "licensed", billingScheme: "per_unit" });

    const tiered = mapItem(
      {
        id: "si_2",
        price: {
          id: "price_2",
          currency: "usd",
          billing_scheme: "tiered",
          unit_amount: null,
          tiers_mode: "graduated",
          transform_quantity: null,
          tiers: [{ up_to: 10, unit_amount: 500, flat_amount: null }],
          recurring: { interval: "year", interval_count: 1, usage_type: "licensed", meter: null, trial_period_days: null },
        },
      },
      []
    );
    expect(tiered).toMatchObject({ quantity: 1, interval: "year", tiersMode: "graduated", tiers: [{ upTo: 10, unitAmount: 500, flatAmount: 0 }] });

    const metered = mapItem(
      {
        id: "si_3",
        price: {
          id: "price_3",
          currency: "usd",
          billing_scheme: "per_unit",
          unit_amount: 5,
          tiers_mode: null,
          transform_quantity: null,
          recurring: { interval: "month", interval_count: 1, usage_type: "metered", meter: "mtr_1", trial_period_days: null },
        },
      },
      []
    );
    expect(metered.usageType).toBe("metered");
  });

  it("maps subscription dates and unknown statuses safely", () => {
    const subscription = mapSubscriptionShell(
      {
        id: "sub_1",
        status: "active",
        currency: "eur",
        start_date: 1767225600,
        trial_start: null,
        trial_end: null,
        canceled_at: null,
        ended_at: null,
        cancel_at_period_end: true,
      },
      [],
      []
    );
    expect(subscription).toMatchObject({ currency: "EUR", startDate: "2026-01-01T00:00:00.000Z", cancelAtPeriodEnd: true });
    expect(mapStatus("something_new")).toBe("incomplete");
  });

  it("maps balance transactions by reporting category", () => {
    expect(
      mapBalanceTransaction({ id: "txn_1", created: 1767225600, amount: -500, currency: "usd", reporting_category: "refund" })
    ).toEqual({ id: "txn_1", createdAt: "2026-01-01T00:00:00.000Z", amount: -500, currency: "USD", category: "refund" });
    expect(
      mapBalanceTransaction({ id: "txn_2", created: 1767225600, amount: -9000, currency: "usd", reporting_category: "payout" }).category
    ).toBe("other");
  });
});
