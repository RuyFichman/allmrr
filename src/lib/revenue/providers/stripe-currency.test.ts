import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/stripe-multi-currency.json";
import { mapCoupon, mapItem, mapSubscriptionShell, priceInCurrency } from "./stripe-mapping";
import { computeMrr } from "../mrr";

type Price = Parameters<typeof mapItem>[0]["price"];
const price = fixture as Price;
const shell = { id: "sub_multi", status: "active" as const, currency: "eur", start_date: 1767225600,
  trial_start: null, trial_end: null, canceled_at: null, ended_at: null, cancel_at_period_end: false };
const times = { start: 1767225600, end: null };
const at = { day: "2026-01-02", mode: "current" as const, fx: { EUR: [["2026-01-01", 1.2] as [string, number]] } };

describe("Stripe currency options", () => {
  it("uses decimal local prices, item and subscription discounts, then rounds once", () => {
    const percent = mapCoupon({ percent_off: 10, amount_off: null, currency: null, duration: "forever" }, times, "eur");
    const amount = mapCoupon({ percent_off: null, amount_off: 100, currency: "usd", duration: "forever",
      currency_options: { eur: { amount_off: 50 } } }, times, "eur");
    const item = mapItem({ id: "si", quantity: 3, price }, [percent], "EUR");
    // (800.25 EUR cents * 3 * 90% - 50 EUR cents) * 1.2 = 2532.81 USD cents -> 2533.
    expect(computeMrr([mapSubscriptionShell(shell, [item], [amount])], at).mrrCents).toBe(2533);
    expect(price.unit_amount).toBe(1000);
  });

  it.each(["graduated", "volume"] as const)("uses %s local tiers including flat amounts", (mode) => {
    const tiered: Price = { ...price, billing_scheme: "tiered", unit_amount: null, tiers_mode: mode,
      tiers: [{ up_to: null, unit_amount: 99999, flat_amount: 0 }],
      currency_options: { eur: { unit_amount: null, tiers: [
        { up_to: 2, unit_amount: 400, flat_amount: 100 },
        { up_to: null, unit_amount: 300, unit_amount_decimal: "300.5", flat_amount: 50 },
      ] } } };
    const discount = mapCoupon({ percent_off: 20, amount_off: null, currency: null, duration: "forever" }, times, "eur");
    const item = mapItem({ id: "si", quantity: 3, price: tiered }, [discount], "eur");
    // Graduated: (2*400 + 100 + 300.5 + 50)*.8*1.2 = 1200.48 -> 1200.
    // Volume: (3*300.5 + 50)*.8*1.2 = 913.44 -> 913.
    expect(computeMrr([mapSubscriptionShell(shell, [item], [])], at).mrrCents).toBe(mode === "graduated" ? 1200 : 913);
  });

  it("preserves package quantities, annual cadence and ignores once discounts", () => {
    const annual: Price = { ...price, recurring: { ...price.recurring!, interval: "year" },
      transform_quantity: { divide_by: 5, round: "up" } };
    const once = mapCoupon({ percent_off: 90, amount_off: null, currency: null, duration: "once" }, times, "eur");
    const item = mapItem({ id: "si", quantity: 8, price: annual }, [once], "eur");
    // ceil(8/5) * 800.25 / 12 * 1.2 = 160.05 -> 160 USD cents/month.
    expect(computeMrr([mapSubscriptionShell(shell, [item], [])], at).mrrCents).toBe(160);
  });

  it("accepts zero amounts and zero-decimal currencies without falling back", () => {
    expect(mapItem({ id: "si", price }, [], "gbp").unitAmount).toBe(0);
    expect(mapItem({ id: "si", price }, [], "jpy").unitAmount).toBe(1200);
    expect(priceInCurrency(price, "USD")).toBe(price);
  });

  it("fails closed for unavailable currency prices and unexpanded local tiers", () => {
    expect(() => mapItem({ id: "si", price }, [], "brl")).toThrow("subscription currency");
    expect(() => mapItem({ id: "si", price: { ...price, billing_scheme: "tiered" } }, [], "eur"))
      .toThrow("subscription currency");
  });
});
