import "server-only";
import type Stripe from "stripe";
import { ProviderAuthError, ProviderPermissionError, ProviderRateLimitError, ProviderUnreachableError } from "../provider-errors";
import { retryAfterMs } from "../provider-http";
import { SyncFailure } from "../failures";

export class StripeResourceMissingError extends Error {}

// SDK retries are disabled for sync reads so Retry-After and every page share one deadline.
export async function stripeRead<T>(read: (options: Stripe.RequestOptions) => PromiseLike<T>, deadline: number): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SyncFailure("The sync time budget was reached. It will be retried later.", "deferred", 60_000);
    try {
      return await read({ maxNetworkRetries: 0, timeout: Math.max(1, Math.min(20_000, remaining)) });
    } catch (error) {
      const e = error as { statusCode?: number; type?: string; headers?: Record<string, string> } | null;
      if (e?.statusCode === 401 || e?.type === "StripeAuthenticationError") throw new ProviderAuthError();
      if (e?.statusCode === 403 || e?.type === "StripePermissionError") throw new ProviderPermissionError();
      if (e?.statusCode === 404) throw new StripeResourceMissingError("The Stripe resource no longer exists.");
      const limited = e?.statusCode === 429 || e?.type === "StripeRateLimitError";
      const transient = limited || e?.statusCode === 408 || (e?.statusCode ?? 0) >= 500 ||
        e?.type === "StripeConnectionError";
      if (!transient) throw new ProviderUnreachableError();
      const delay = Math.max(retryAfterMs(e?.headers?.["retry-after"] ?? null),
        Math.min(8000, 500 * 2 ** attempt) * (0.5 + Math.random() * 0.5));
      if (attempt === 3 || Date.now() + delay >= deadline) {
        if (limited) throw new ProviderRateLimitError(delay);
        if (Date.now() + delay >= deadline) throw new SyncFailure("The sync time budget was reached. It will be retried later.", "deferred", delay);
        throw new ProviderUnreachableError();
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new ProviderUnreachableError();
}

export async function* stripePages<T extends { id: string }>(
  read: (cursor: string | undefined, options: Stripe.RequestOptions) => PromiseLike<{ data: T[]; has_more: boolean }>,
  deadline: number
) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (;;) {
    const page = await stripeRead((options) => read(cursor, options), deadline);
    for (const row of page.data) yield row;
    if (!page.has_more) return;
    const next = page.data.at(-1)?.id;
    if (!next || seen.has(next)) throw new ProviderUnreachableError();
    seen.add(next);
    cursor = next;
  }
}
