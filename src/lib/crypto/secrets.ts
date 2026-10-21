import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for provider credentials at rest.
// Format: v<keyVersion>:<iv_b64>:<tag_b64>:<ciphertext_b64>, with the connection id as AAD
// so a ciphertext copied onto another row fails to decrypt. Rotation: docs/security.md.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretKeyConfigError extends Error {}

export function currentKeyVersion() {
  const raw = process.env.REVENUE_ENCRYPTION_KEY_VERSION ?? "1";
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new SecretKeyConfigError("REVENUE_ENCRYPTION_KEY_VERSION must be a positive integer.");
  }
  return version;
}

// The current key lives in REVENUE_ENCRYPTION_KEY; retired ones in REVENUE_ENCRYPTION_KEY_V<n>.
function keyFor(version: number) {
  const name = version === currentKeyVersion() ? "REVENUE_ENCRYPTION_KEY" : `REVENUE_ENCRYPTION_KEY_V${version}`;
  const encoded = process.env[name];
  if (!encoded) throw new SecretKeyConfigError(`${name} is not set.`);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretKeyConfigError(`${name} must be ${KEY_BYTES} bytes, base64-encoded.`);
  }
  return key;
}

// Call at startup paths that will need encryption, to fail fast on bad configuration.
export function assertEncryptionConfigured() {
  keyFor(currentKeyVersion());
}

export function encryptSecret(plaintext: string, aad: string) {
  const version = currentKeyVersion();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFor(version), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: `v${version}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`,
    keyVersion: version,
  };
}

export function decryptSecret(payload: string, aad: string) {
  const [versionPart, ivPart, tagPart, dataPart, ...rest] = payload.split(":");
  const version = Number(versionPart?.slice(1));
  if (!versionPart?.startsWith("v") || !Number.isInteger(version) || !ivPart || !tagPart || !dataPart || rest.length) {
    throw new Error("Malformed encrypted secret.");
  }

  const decipher = createDecipheriv(ALGORITHM, keyFor(version), Buffer.from(ivPart, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Never echo the payload or the key: a generic message is enough to debug.
    throw new Error("Encrypted secret failed authentication.");
  }
}

export function keyVersionOf(payload: string) {
  const match = /^v(\d+):/.exec(payload);
  return match ? Number(match[1]) : null;
}
