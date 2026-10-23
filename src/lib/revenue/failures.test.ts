import { describe, expect, it } from "vitest";
import { classifySyncFailure, needsConnectionAttention, retryAtFromStats } from "./failures";
import { ProviderAuthError, ProviderPermissionError, ProviderRateLimitError } from "./provider-errors";

describe("sync failure policy", () => {
  it("classifies revoked keys and permissions without exposing native errors", () => {
    expect(classifySyncFailure(new ProviderAuthError()).kind).toBe("revoked");
    expect(classifySyncFailure(new ProviderPermissionError()).kind).toBe("permission");
    const failure = classifySyncFailure({ type: "StripePermissionError", message: "opaque-secret-value" });
    expect(failure.message).not.toContain("opaque-secret-value");
    expect(classifySyncFailure(new Error("opaque-secret-value")).message).not.toContain("opaque-secret-value");
  });
  it("defers rate limits and preserves the requested delay", () => {
    expect(classifySyncFailure(new ProviderRateLimitError(172800000))).toMatchObject({ kind: "deferred", retryAfterMs: 172800000 });
    expect(retryAtFromStats({ retryAt: "2026-10-24T00:00:00Z" })).toBe(Date.parse("2026-10-24T00:00:00Z"));
    expect(retryAtFromStats({ retryAt: "invalid" })).toBe(0);
  });
  it("warns after two daily failures and immediately for invalid credentials", () => {
    expect(needsConnectionAttention("active", 1)).toBe(false);
    expect(needsConnectionAttention("active", 2)).toBe(true);
    expect(needsConnectionAttention("revoked", 1)).toBe(true);
    expect(needsConnectionAttention("error", 1)).toBe(true);
  });
});
