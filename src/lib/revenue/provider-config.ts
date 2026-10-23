import type { Database } from "@/lib/supabase/database.types";
import { classifyStripeKey, type KeyCheck } from "./providers/stripe-mapping";
import { STRIPE_PERMISSIONS } from "./providers/stripe-permissions";

export type ProviderId = Database["public"]["Enums"]["revenue_provider"];

export type ProviderPermission = {
  id: string;
  group: string;
  resource: string;
  purpose: string;
  required: boolean;
};

type CredentialPolicy = {
  permissions: readonly ProviderPermission[];
  classify: (raw: string, allowTest: boolean) => KeyCheck;
};

// Register a policy only after researching the provider's read-only credentials.
export const PROVIDER_POLICIES: Partial<Record<ProviderId, CredentialPolicy>> = {
  stripe: { permissions: STRIPE_PERMISSIONS, classify: classifyStripeKey },
};

export function classifyProviderKey(provider: ProviderId, raw: string, allowTest: boolean): KeyCheck {
  const policy = PROVIDER_POLICIES[provider];
  if (!policy) return { ok: false, reason: "wrong_key_type", message: "This provider is not supported yet." };
  return policy.classify(raw, allowTest);
}
