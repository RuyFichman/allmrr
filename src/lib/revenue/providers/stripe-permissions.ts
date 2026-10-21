// The read-only permissions the Stripe sync needs, derived from the calls it makes.
// Labels follow the "Create restricted key" form in the Stripe Dashboard; ids follow
// https://docs.stripe.com/stripe-apps/reference/permissions.

export type StripePermission = {
  id: string;
  group: "Core" | "Billing";
  resource: string;
  purpose: string;
  required: boolean;
};

export const STRIPE_PERMISSIONS: StripePermission[] = [
  {
    id: "subscription_read",
    group: "Billing",
    resource: "Subscriptions",
    purpose: "Current and past subscriptions, to compute MRR.",
    required: true,
  },
  {
    id: "plan_read",
    group: "Billing",
    resource: "Prices",
    purpose: "Price amounts, intervals and tiers.",
    required: true,
  },
  {
    id: "coupon_read",
    group: "Billing",
    resource: "Coupons",
    purpose: "Discounts that reduce MRR.",
    required: true,
  },
  {
    id: "balance_read",
    group: "Core",
    resource: "Balance",
    purpose: "Balance transactions (payments, refunds, disputes), for total revenue.",
    required: true,
  },
  {
    id: "connected_account_read",
    group: "Core",
    resource: "Accounts",
    purpose: "Your Stripe account id, so one Stripe account verifies only one startup. Optional.",
    required: false,
  },
];

// The Dashboard doesn't support pre-filled restricted keys, so the UI links here and
// lists the permissions to tick.
export const STRIPE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys";
export const STRIPE_TEST_API_KEYS_URL = "https://dashboard.stripe.com/test/apikeys";
