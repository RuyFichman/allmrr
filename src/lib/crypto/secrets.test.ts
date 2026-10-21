import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactSecrets, redactedMessage } from "./redact";
import { assertEncryptionConfigured, decryptSecret, encryptSecret, keyVersionOf } from "./secrets";

const CONNECTION_A = "6a1f5c1e-0d3b-4c67-9b0e-2f2a5d1c9e01";
const CONNECTION_B = "0c9e6d2b-7a44-4f3e-8f1d-6b5a4c3d2e1f";
const SECRET = "rk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz";

describe("secrets", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.REVENUE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.REVENUE_ENCRYPTION_KEY_VERSION;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("round-trips with the v1 format", () => {
    const { ciphertext, keyVersion } = encryptSecret(SECRET, CONNECTION_A);
    expect(keyVersion).toBe(1);
    expect(ciphertext).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(ciphertext).not.toContain(SECRET);
    expect(decryptSecret(ciphertext, CONNECTION_A)).toBe(SECRET);
  });

  it("uses a fresh IV every time", () => {
    const a = encryptSecret(SECRET, CONNECTION_A).ciphertext;
    const b = encryptSecret(SECRET, CONNECTION_A).ciphertext;
    expect(a).not.toBe(b);
    expect(Buffer.from(a.split(":")[1], "base64")).toHaveLength(12);
  });

  it("fails when the ciphertext is moved to another connection", () => {
    const { ciphertext } = encryptSecret(SECRET, CONNECTION_A);
    expect(() => decryptSecret(ciphertext, CONNECTION_B)).toThrow("failed authentication");
  });

  it("fails on tampering without leaking the payload", () => {
    const { ciphertext } = encryptSecret(SECRET, CONNECTION_A);
    const parts = ciphertext.split(":");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 1;
    parts[3] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"), CONNECTION_A)).toThrow(/^Encrypted secret failed authentication\.$/);
    expect(() => decryptSecret("garbage", CONNECTION_A)).toThrow("Malformed");
  });

  it("decrypts older versions with a retired key after rotation", () => {
    const { ciphertext } = encryptSecret(SECRET, CONNECTION_A);
    process.env.REVENUE_ENCRYPTION_KEY_V1 = process.env.REVENUE_ENCRYPTION_KEY;
    process.env.REVENUE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.REVENUE_ENCRYPTION_KEY_VERSION = "2";

    expect(decryptSecret(ciphertext, CONNECTION_A)).toBe(SECRET);
    const rotated = encryptSecret(SECRET, CONNECTION_A);
    expect(keyVersionOf(rotated.ciphertext)).toBe(2);
    expect(decryptSecret(rotated.ciphertext, CONNECTION_A)).toBe(SECRET);
  });

  it("fails fast on a missing or wrong-length key", () => {
    delete process.env.REVENUE_ENCRYPTION_KEY;
    expect(() => assertEncryptionConfigured()).toThrow("REVENUE_ENCRYPTION_KEY is not set");
    process.env.REVENUE_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret(SECRET, CONNECTION_A)).toThrow("must be 32 bytes");
  });
});

describe("redactSecrets", () => {
  it("masks live, test, secret, restricted and publishable keys", () => {
    expect(redactSecrets(`bad key ${SECRET} and sk_live_abc123 and pk_test_XYZ`)).toBe(
      "bad key rk_test_[redacted] and sk_live_[redacted] and pk_test_[redacted]"
    );
  });

  it("redacts thrown errors", () => {
    expect(redactedMessage(new Error(`Invalid API Key provided: ${SECRET}`))).toBe(
      "Invalid API Key provided: rk_test_[redacted]"
    );
  });
});
