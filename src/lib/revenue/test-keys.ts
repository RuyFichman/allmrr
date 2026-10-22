import "server-only";
import type { ProviderId } from "./provider-config";

export function allowProviderTestKeys(provider: ProviderId) {
  return process.env[`ALLOW_${provider.toUpperCase()}_TEST_KEYS`] === "true";
}
