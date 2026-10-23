import "server-only";
import Stripe from "stripe";
import { redactedMessage } from "@/lib/crypto/redact";
import { classifyProviderKey } from "../provider-config";
import { allowProviderTestKeys } from "../test-keys";
import type {
  NormalizedDiscount,
  NormalizedSubscription,
  NormalizedTransaction,
  ProviderContext,
  RevenueProvider,
  ValidationResult,
} from "../types";
import {
  mapBalanceTransaction,
  mapCoupon,
  mapItem,
  mapSubscriptionShell,
} from "./stripe-mapping";
import { STRIPE_PERMISSIONS, type StripePermission } from "./stripe-permissions";

// Pinned to the API version bundled with the installed SDK, so the types match responses.
export const STRIPE_API_VERSION = Stripe.API_VERSION;

export function createStripeClient(key: string) {
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 3,
    timeout: 20_000,
    appInfo: { name: "AllMRR revenue verification" },
  });
}

export function allowTestKeys() {
  return allowProviderTestKeys("stripe");
}

type StripeErrorLike = { type?: string; statusCode?: number; message?: string };

function asStripeError(error: unknown): StripeErrorLike {
  return typeof error === "object" && error !== null ? (error as StripeErrorLike) : {};
}

export function isAuthenticationError(error: unknown) {
  return asStripeError(error).type === "StripeAuthenticationError";
}

export function isPermissionError(error: unknown) {
  const e = asStripeError(error);
  return e.type === "StripePermissionError" || e.statusCode === 403;
}

// One read-only `limit: 1` call per permission. No write probes, ever.
const PROBES: Record<string, (stripe: Stripe) => Promise<unknown>> = {
  subscription_read: (stripe) => stripe.subscriptions.list({ limit: 1, status: "all" }),
  plan_read: (stripe) => stripe.prices.list({ limit: 1 }),
  coupon_read: (stripe) => stripe.coupons.list({ limit: 1 }),
  balance_read: (stripe) => stripe.balanceTransactions.list({ limit: 1 }),
};

async function validateCredentials(rawKey: string): Promise<ValidationResult> {
  const check = classifyProviderKey("stripe", rawKey, allowTestKeys());
  if (!check.ok) return check;

  const stripe = createStripeClient(rawKey.trim());
  const missing: StripePermission[] = [];

  for (const permission of STRIPE_PERMISSIONS.filter((p) => p.required)) {
    try {
      await PROBES[permission.id](stripe);
    } catch (error) {
      if (isAuthenticationError(error)) {
        return { ok: false, reason: "invalid_key", message: "Stripe rejected this key. Check that it was copied in full and is not expired or revoked." };
      }
      if (isPermissionError(error)) {
        missing.push(permission);
        continue;
      }
      return { ok: false, reason: "unreachable", message: `Couldn't reach Stripe to validate the key: ${redactedMessage(error)}` };
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_permissions",
      message: "The key is missing some read permissions.",
      missing: missing.map((p) => `${p.group} → ${p.resource}: Read`),
    };
  }

  // The account id needs Accounts: Read. Without it we still verify, but can't enforce
  // the one-account-per-startup rule.
  let accountId: string | null = null;
  const missingOptional: string[] = [];
  try {
    accountId = (await stripe.accounts.retrieveCurrent()).id;
  } catch (error) {
    if (!isPermissionError(error)) throw new Error(redactedMessage(error));
    missingOptional.push("Core → Accounts: Read");
  }

  return { ok: true, accountId, missingOptional, livemode: check.livemode };
}

type ExpandedDiscount = Stripe.Discount & { source: { coupon: string | Stripe.Coupon | null } };

// Coupons on item-level discounts can't be expanded that deep, so they are fetched once each.
function couponResolver(stripe: Stripe, stats: Record<string, number>) {
  const cache = new Map<string, Stripe.Coupon | null>();
  return async (coupon: string | Stripe.Coupon | null, currency: string) => {
    if (coupon === null) return null;
    if (typeof coupon !== "string" && (coupon.amount_off === null ||
      coupon.currency?.toLowerCase() === currency.toLowerCase() || coupon.currency_options?.[currency.toLowerCase()])) return coupon;
    const id = typeof coupon === "string" ? coupon : coupon.id;
    if (!cache.has(id)) {
      try {
        cache.set(id, await stripe.coupons.retrieve(id, { expand: ["currency_options"] }));
      } catch (error) {
        if (isAuthenticationError(error)) throw error;
        // Deleted coupons keep applying to existing discounts but can't be read back.
        stats.discountsUnresolved = (stats.discountsUnresolved ?? 0) + 1;
        cache.set(id, null);
      }
    }
    return cache.get(id) ?? null;
  };
}

// Resolve currency-specific tiers directly: expanding them from a subscription list is too deep.
function priceResolver(stripe: Stripe) {
  const cache = new Map<string, Stripe.Price>();
  return async (price: Stripe.Price, currency: string) => {
    const target = currency.toLowerCase();
    const mismatch = price.currency.toLowerCase() !== target;
    const option = price.currency_options?.[target];
    const tiered = price.billing_scheme === "tiered";
    if (mismatch ? option && (!tiered || option.tiers?.length) : !tiered || price.tiers?.length) return price;
    const key = `${price.id}:${target}`;
    const expand = mismatch ? ["currency_options", ...(tiered ? [`currency_options.${target}.tiers`] : [])] : ["tiers"];
    if (!cache.has(key)) cache.set(key, await stripe.prices.retrieve(price.id, { expand }));
    return cache.get(key)!;
  };
}

async function* fetchSubscriptions(ctx: ProviderContext): AsyncIterable<NormalizedSubscription> {
  const stripe = createStripeClient(ctx.credentials);
  const resolveCoupon = couponResolver(stripe, ctx.stats);
  const resolvePrice = priceResolver(stripe);

  const toDiscounts = async (discounts: Array<string | Stripe.Discount>, currency: string) => {
    const result: NormalizedDiscount[] = [];
    for (const discount of discounts) {
      if (typeof discount === "string") {
        ctx.stats.discountsUnresolved = (ctx.stats.discountsUnresolved ?? 0) + 1;
        continue;
      }
      const coupon = await resolveCoupon((discount as ExpandedDiscount).source?.coupon ?? null, currency);
      if (coupon) result.push(mapCoupon(coupon as Parameters<typeof mapCoupon>[0], discount, currency));
    }
    return result;
  };

  const subscriptions = stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.discounts.source.coupon", "data.items.data.discounts"],
  });

  // Auto-pagination fetches pages sequentially, which keeps us well under rate limits.
  for await (const subscription of subscriptions) {
    let items = subscription.items.data;
    if (subscription.items.has_more) {
      items = [];
      for await (const item of stripe.subscriptionItems.list({ subscription: subscription.id, limit: 100, expand: ["data.discounts"] })) {
        items.push(item);
      }
    }

    const normalizedItems = [];
    for (const item of items) {
      if (item.price.currency.toLowerCase() !== subscription.currency.toLowerCase()) {
        ctx.stats.currencyMismatchItems = (ctx.stats.currencyMismatchItems ?? 0) + 1;
      }
      const price = await resolvePrice(item.price, subscription.currency);
      normalizedItems.push(
        mapItem(
          { id: item.id, quantity: item.quantity, price: price as Parameters<typeof mapItem>[0]["price"] },
          await toDiscounts(item.discounts, subscription.currency),
          subscription.currency
        )
      );
    }

    ctx.stats.subscriptionsFetched = (ctx.stats.subscriptionsFetched ?? 0) + 1;
    yield mapSubscriptionShell(subscription, normalizedItems, await toDiscounts(subscription.discounts, subscription.currency));
  }
}

async function* fetchTransactions(ctx: ProviderContext, since?: Date): AsyncIterable<NormalizedTransaction> {
  const stripe = createStripeClient(ctx.credentials);
  const transactions = stripe.balanceTransactions.list({
    limit: 100,
    ...(since ? { created: { gte: Math.floor(since.getTime() / 1000) } } : {}),
  });
  for await (const transaction of transactions) {
    ctx.stats.balanceTransactionsFetched = (ctx.stats.balanceTransactionsFetched ?? 0) + 1;
    yield mapBalanceTransaction(transaction);
  }
}

export const stripeProvider: RevenueProvider = {
  validateCredentials,
  fetchSubscriptions,
  fetchTransactions,
};
