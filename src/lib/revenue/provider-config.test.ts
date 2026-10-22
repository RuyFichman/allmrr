import { afterEach, expect, it, vi } from "vitest";
import { classifyProviderKey } from "./provider-config";
import { allowProviderTestKeys } from "./test-keys";
import { getRevenueProvider } from "./provider-registry";
import { stripeProvider } from "./providers/stripe";

afterEach(() => vi.unstubAllEnvs());

it("keeps the Stripe adapter and rejects unimplemented providers", () => {
  expect(getRevenueProvider("stripe")).toBe(stripeProvider);
  expect(getRevenueProvider("polar")).toBeUndefined();
  expect(classifyProviderKey("polar", "opaque", true).ok).toBe(false);
  expect(classifyProviderKey("stripe", "rk_test_abc", false)).toMatchObject({ reason: "test_key_not_allowed" });
});

it("isolates test-key opt-ins by provider", () => {
  vi.stubEnv("ALLOW_STRIPE_TEST_KEYS", "true");
  vi.stubEnv("ALLOW_POLAR_TEST_KEYS", "false");
  expect(allowProviderTestKeys("stripe")).toBe(true);
  expect(allowProviderTestKeys("polar")).toBe(false);
});
