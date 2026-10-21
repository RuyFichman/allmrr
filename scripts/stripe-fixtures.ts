// Populates a Stripe TEST account with realistic billing data for verifying the AllMRR sync.
// Usage (Node 24 runs TypeScript directly):
//   STRIPE_FIXTURES_SECRET_KEY=sk_test_... node scripts/stripe-fixtures.ts [--force]
// Refuses to run with anything but a test-mode secret key.

import Stripe from "stripe";

const MARKER = "allmrr_fixture";

const key = process.env.STRIPE_FIXTURES_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error("STRIPE_FIXTURES_SECRET_KEY must be a test-mode secret key (sk_test_…). Refusing to run.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: Stripe.API_VERSION, maxNetworkRetries: 3 });
const meta = { [MARKER]: "v1" };

async function alreadySeeded() {
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (product.metadata?.[MARKER]) return true;
  }
  return false;
}

async function price(name: string, currency: string, unitAmount: number, interval: "month" | "year", intervalCount = 1) {
  const product = await stripe.products.create({ name, metadata: meta });
  return stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: unitAmount,
    recurring: { interval, interval_count: intervalCount },
    metadata: meta,
  });
}

async function customer(name: string, paymentMethod = "pm_card_visa", testClock?: string) {
  return stripe.customers.create({
    name,
    email: `${name.toLowerCase().replace(/\W+/g, ".")}@fixtures.example`,
    payment_method: paymentMethod,
    invoice_settings: { default_payment_method: paymentMethod },
    test_clock: testClock,
    metadata: meta,
  });
}

async function waitForClock(id: string) {
  for (let i = 0; i < 60; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(id);
    if (clock.status === "ready") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Test clock did not finish advancing in time.");
}

async function main() {
  if ((await alreadySeeded()) && !process.argv.includes("--force")) {
    console.error("Fixtures already exist in this account. Re-run with --force to add another set.");
    process.exit(1);
  }

  const proMonthly = await price("Fixture Pro (monthly, USD)", "usd", 4900, "month");
  const teamAnnual = await price("Fixture Team (annual, USD)", "usd", 58800, "year");
  const quarterly = await price("Fixture Quarterly (USD)", "usd", 9000, "month", 3);
  const brlMonthly = await price("Fixture Plano (mensal, BRL)", "brl", 9900, "month");
  const eurMonthly = await price("Fixture Plan (monthly, EUR)", "eur", 2900, "month");
  const coupon = await stripe.coupons.create({ percent_off: 20, duration: "forever", name: "Fixture 20% forever", metadata: meta });

  const created: Array<[string, Stripe.Subscription]> = [];
  const subscribe = async (label: string, params: Stripe.SubscriptionCreateParams) => {
    const subscription = await stripe.subscriptions.create({ ...params, metadata: meta });
    created.push([label, subscription]);
    return subscription;
  };

  await subscribe("monthly x2 seats", { customer: (await customer("Monthly Seats")).id, items: [{ price: proMonthly.id, quantity: 2 }] });
  await subscribe("annual with 20% coupon", {
    customer: (await customer("Annual Coupon")).id,
    items: [{ price: teamAnnual.id }],
    discounts: [{ coupon: coupon.id }],
  });
  await subscribe("quarterly", { customer: (await customer("Quarterly")).id, items: [{ price: quarterly.id }] });
  await subscribe("BRL monthly", { customer: (await customer("Cliente BRL")).id, items: [{ price: brlMonthly.id }] });
  await subscribe("EUR monthly", { customer: (await customer("Kunde EUR")).id, items: [{ price: eurMonthly.id }] });
  await subscribe("trialing (excluded)", {
    customer: (await customer("Trial")).id,
    items: [{ price: proMonthly.id }],
    trial_period_days: 14,
  });
  const ending = await subscribe("cancel at period end (counted)", {
    customer: (await customer("Leaving Soon")).id,
    items: [{ price: proMonthly.id }],
  });
  await stripe.subscriptions.update(ending.id, { cancel_at_period_end: true });

  // past_due: subscribe on a test clock, switch to a failing card, advance past the renewal.
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: "AllMRR past_due" });
  const lateCustomer = await customer("Past Due", "pm_card_visa", clock.id);
  const late = await subscribe("past_due (counted)", { customer: lateCustomer.id, items: [{ price: proMonthly.id }] });
  const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: lateCustomer.id });
  await stripe.customers.update(lateCustomer.id, { invoice_settings: { default_payment_method: failing.id } });
  await stripe.subscriptions.update(late.id, { default_payment_method: failing.id });
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: Math.floor(Date.now() / 1000) + 32 * 24 * 3600 });
  await waitForClock(clock.id);

  // A one-off payment of $100 with a $30 refund.
  const refundCustomer = await customer("One-off Buyer");
  const payment = await stripe.paymentIntents.create({
    amount: 10000,
    currency: "usd",
    customer: refundCustomer.id,
    payment_method: "pm_card_visa",
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: meta,
  });
  await stripe.refunds.create({ payment_intent: payment.id, amount: 3000, metadata: meta });

  console.log("Created fixture subscriptions:");
  for (const [label, subscription] of created) {
    const fresh = await stripe.subscriptions.retrieve(subscription.id);
    console.log(`  ${fresh.status.padEnd(9)} ${label} (${fresh.id})`);
  }
  console.log("Plus a $100 payment with a $30 refund. Compare AllMRR with Billing → Overview in the Stripe test dashboard.");
}

main().catch((error: unknown) => {
  // Never print the key; Stripe errors don't include it, but redact defensively.
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_[redacted]"));
  process.exit(1);
});
