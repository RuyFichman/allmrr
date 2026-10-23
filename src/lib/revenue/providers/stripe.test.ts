import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/stripe-multi-currency.json";

const sdk = vi.hoisted(() => ({
  subscriptions: { list: vi.fn() },
  subscriptionItems: { list: vi.fn() },
  prices: { retrieve: vi.fn() },
  coupons: { retrieve: vi.fn() },
}));
vi.mock("stripe", () => ({ default: class {
  static API_VERSION = "test";
  subscriptions = sdk.subscriptions;
  subscriptionItems = sdk.subscriptionItems;
  prices = sdk.prices;
  coupons = sdk.coupons;
} }));

import { stripeProvider } from "./stripe";

function subscription(id: string, currency: string, price: object, discounts: object[] = []) {
  return { id, currency, status: "active", start_date: 1767225600, trial_start: null, trial_end: null,
    canceled_at: null, ended_at: null, cancel_at_period_end: false, discounts,
    items: { has_more: false, data: [{ id: `si_${id}`, quantity: 1, price, discounts: [] }] } };
}

describe("Stripe currency expansion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retrieves missing currency options once per price/currency and expands coupons", async () => {
    const unexpanded = { ...fixture, currency_options: undefined };
    const coupon = { id: "coupon", percent_off: null, amount_off: 100, currency: "usd", duration: "forever" };
    const discounts = [{ id: "discount", start: 1767225600, end: null, source: { coupon } }];
    sdk.subscriptions.list.mockReturnValue([
      subscription("usd", "usd", unexpanded),
      subscription("eur1", "eur", unexpanded, discounts),
      subscription("eur2", "eur", unexpanded, discounts),
    ]);
    sdk.prices.retrieve.mockResolvedValue(fixture);
    sdk.coupons.retrieve.mockResolvedValue({ ...coupon, currency_options: { eur: { amount_off: 50 } } });
    const rows = [];
    for await (const row of stripeProvider.fetchSubscriptions({ credentials: "fixture", stats: {} })) rows.push(row);
    expect(rows.map((row) => row.items[0].unitAmount)).toEqual([1000, 800.25, 800.25]);
    expect(rows[1].discounts[0]).toMatchObject({ amountOff: 50, currency: "EUR" });
    expect(sdk.prices.retrieve).toHaveBeenCalledExactlyOnceWith("price_multi", { expand: ["currency_options"] });
    expect(sdk.coupons.retrieve).toHaveBeenCalledExactlyOnceWith("coupon", { expand: ["currency_options"] });
  });

  it("expands local tiers even when default-currency tiers are present", async () => {
    const price = { ...fixture, billing_scheme: "tiered", tiers_mode: "volume",
      tiers: [{ up_to: null, unit_amount: 9000, flat_amount: null }], currency_options: undefined };
    sdk.subscriptions.list.mockReturnValue([subscription("eur", "eur", price)]);
    sdk.prices.retrieve.mockResolvedValue({ ...price, currency_options: { eur: { unit_amount: null,
      tiers: [{ up_to: null, unit_amount: 200, flat_amount: null }] } } });
    const rows = [];
    for await (const row of stripeProvider.fetchSubscriptions({ credentials: "fixture", stats: {} })) rows.push(row);
    expect(rows[0].items[0].tiers[0].unitAmount).toBe(200);
    expect(sdk.prices.retrieve).toHaveBeenCalledExactlyOnceWith("price_multi", {
      expand: ["currency_options", "currency_options.eur.tiers"],
    });
  });

  it("does not yield a misleading subscription if the target price is unavailable", async () => {
    sdk.subscriptions.list.mockReturnValue([subscription("brl", "brl", fixture)]);
    sdk.prices.retrieve.mockResolvedValue(fixture);
    const iterator = stripeProvider.fetchSubscriptions({ credentials: "fixture", stats: {} })[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("subscription currency");
  });
});
