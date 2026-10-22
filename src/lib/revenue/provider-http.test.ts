import { afterEach, describe, expect, it, vi } from "vitest";
import { providerGet, retryAfterMs } from "./provider-http";
import { ProviderAuthError, ProviderPermissionError, ProviderRateLimitError, ProviderUnreachableError } from "./provider-errors";

const options = { origin: "https://api.example.com", path: "/subscriptions", headers: { Authorization: "Bearer opaque-secret" } };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("provider HTTP reads", () => {
  it("honors seconds and HTTP dates", () => {
    expect(retryAfterMs("3", 0)).toBe(3000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:05 GMT", 1000)).toBe(4000);
    expect(retryAfterMs("invalid", 0)).toBe(0);
  });

  it("uses uncached GET and rejects credential-bearing redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await providerGet(options)).toEqual({ items: [] });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    await expect(providerGet({ ...options, path: "https://attacker.test/next" })).rejects.toBeInstanceOf(ProviderUnreachableError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([[401, ProviderAuthError], [403, ProviderPermissionError], [400, ProviderUnreachableError]])("does not retry HTTP %s or expose its body", async (status, errorClass) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("opaque-secret", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(providerGet(options)).rejects.toBeInstanceOf(errorClass);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("waits at least Retry-After before retrying", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "2" } })).mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const pending = providerGet(options);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: true });
  });

  it("defers long rate limits instead of retrying early", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "120" } })));
    await expect(providerGet(options)).rejects.toMatchObject({ retryAfterMs: 120_000 });
    await expect(providerGet(options)).rejects.toBeInstanceOf(ProviderRateLimitError);
  });

  it.each(["network", "server"])("bounds retries for %s errors and removes secrets", async (kind) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => kind === "network" ? Promise.reject(new Error("opaque-secret")) : Promise.resolve(new Response("opaque-secret", { status: 503 })));
    vi.stubGlobal("fetch", fetcher);
    const assertion = expect(providerGet(options)).rejects.toThrow("The provider could not complete the request.");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
