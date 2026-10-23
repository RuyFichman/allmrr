import { ProviderAuthError, ProviderPermissionError, ProviderRateLimitError, ProviderUnreachableError } from "./provider-errors";
import { MissingFxRateError } from "./fx";

// With daily syncs, two failures warn at roughly 48h, before verification expires at 72h.
export const FAILURE_ALERT_THRESHOLD = 2;

export class SyncFailure extends Error {
  constructor(message: string, readonly kind: "revoked" | "permission" | "transient" | "deferred", readonly retryAfterMs = 0) {
    super(message);
  }
}

// Never surface native provider messages: even an unrecognized token can be echoed in them.
export function classifySyncFailure(error: unknown): SyncFailure {
  if (error instanceof SyncFailure) return error;
  const native = typeof error === "object" && error !== null
    ? error as { type?: string; statusCode?: number } : {};
  if (error instanceof ProviderAuthError || native.type === "StripeAuthenticationError" || native.statusCode === 401) {
    return new SyncFailure("The provider rejected this key. Reconnect with a valid read-only key.", "revoked");
  }
  if (error instanceof ProviderPermissionError || native.type === "StripePermissionError" || native.statusCode === 403) {
    return new SyncFailure("The key is missing a required read permission. Review its permissions and reconnect.", "permission");
  }
  if (error instanceof ProviderRateLimitError || native.type === "StripeRateLimitError" || native.statusCode === 429) {
    return new SyncFailure("The provider rate limit was reached. Sync will be retried later.", "deferred",
      error instanceof ProviderRateLimitError ? error.retryAfterMs : 60_000);
  }
  if (error instanceof MissingFxRateError) {
    return new SyncFailure("An exchange rate is unavailable. Existing revenue has been preserved.", "transient");
  }
  if (error instanceof ProviderUnreachableError) {
    return new SyncFailure("The provider could not be reached. Sync will be retried.", "transient");
  }
  return new SyncFailure("Revenue could not be synced. Existing snapshots have been preserved. Try again later.", "transient");
}

export function needsConnectionAttention(status: string, failures: number) {
  return status === "revoked" || status === "error" || failures >= FAILURE_ALERT_THRESHOLD;
}

export function retryAtFromStats(stats: unknown): number {
  if (!stats || typeof stats !== "object" || !("retryAt" in stats) || typeof stats.retryAt !== "string") return 0;
  const value = Date.parse(stats.retryAt);
  return Number.isFinite(value) ? value : 0;
}
