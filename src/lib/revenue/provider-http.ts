import "server-only";
import { ProviderAuthError, ProviderPermissionError, ProviderRateLimitError, ProviderUnreachableError } from "./provider-errors";

type ReadOptions = {
  origin: string;
  path: string;
  headers: Record<string, string>;
  deadline?: number;
};

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

// GET only. Never surface response bodies, URLs or native errors: they may echo credentials.
export async function providerGet<T>({ origin, path, headers, deadline = Date.now() + 60_000 }: ReadOptions): Promise<T> {
  let url: URL;
  try {
    url = new URL(path, origin);
    if (url.origin !== new URL(origin).origin || url.protocol !== "https:" || url.username || url.password) {
      throw new Error();
    }
  } catch {
    throw new ProviderUnreachableError();
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderUnreachableError();
    let failure: ProviderUnreachableError | ProviderRateLimitError = new ProviderUnreachableError();
    let delay = Math.min(8000, 500 * 2 ** attempt) * (0.5 + Math.random() * 0.5);
    try {
      const response = await fetch(url, {
        method: "GET", headers, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, remaining))),
      });
      if (response.ok) {
        try { return await response.json() as T; }
        catch { throw new ProviderUnreachableError(); }
      }
      await response.body?.cancel();
      if (response.status === 401) throw new ProviderAuthError();
      if (response.status === 403) throw new ProviderPermissionError();
      delay = Math.max(delay, retryAfterMs(response.headers.get("retry-after")));
      if (response.status === 429) failure = new ProviderRateLimitError(delay);
      else if (response.status !== 408 && response.status < 500) throw new ProviderUnreachableError();
    } catch (error) {
      if (error instanceof ProviderAuthError || error instanceof ProviderPermissionError || error instanceof ProviderUnreachableError) throw error;
      // Network and timeout errors are retried without retaining their potentially sensitive text.
    }
    if (attempt === 3 || Date.now() + delay >= deadline) throw failure;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new ProviderUnreachableError();
}
