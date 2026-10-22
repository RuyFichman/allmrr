import "server-only";
import type { ProviderId } from "./provider-config";
import { stripeProvider } from "./providers/stripe";
import type { RevenueProvider } from "./types";

const PROVIDERS: Partial<Record<ProviderId, RevenueProvider>> = { stripe: stripeProvider };

export function getRevenueProvider(provider: ProviderId) {
  return PROVIDERS[provider];
}
