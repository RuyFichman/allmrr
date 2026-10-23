import { afterEach, describe, expect, it, vi } from "vitest";
import { stripePages, stripeRead } from "./stripe-read";
import { ProviderAuthError, ProviderRateLimitError } from "../provider-errors";

afterEach(() => vi.useRealTimers());

describe("bounded Stripe reads", () => {
  it("defers Retry-After beyond the deadline without retrying early", async () => {
    const read = vi.fn().mockRejectedValue({ statusCode: 429, headers: { "retry-after": "120" }, message: "secret" });
    await expect(stripeRead(read, Date.now() + 1000)).rejects.toMatchObject({ retryAfterMs: 120000 });
    expect(read).toHaveBeenCalledOnce();
  });
  it("does not retry authentication errors", async () => {
    const read = vi.fn().mockRejectedValue({ statusCode: 401 });
    await expect(stripeRead(read, Date.now() + 1000)).rejects.toBeInstanceOf(ProviderAuthError);
    expect(read).toHaveBeenCalledOnce();
  });
  it("waits for Retry-After and then retries", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce({ statusCode: 429, headers: { "retry-after": "2" } }).mockResolvedValue("ok");
    const pending = stripeRead(read, Date.now() + 10000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("ok");
  });
  it("bounds retry attempts and normalizes rate-limit errors", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValue({ statusCode: 429 });
    const assertion = expect(stripeRead(read, Date.now() + 60000)).rejects.toBeInstanceOf(ProviderRateLimitError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(read).toHaveBeenCalledTimes(4);
  });
  it("paginates explicitly and refuses a repeating cursor", async () => {
    const read = vi.fn().mockResolvedValue({ data: [{ id: "same" }], has_more: true });
    const collect = async () => { for await (const _row of stripePages(read, Date.now() + 1000)) { void _row; } };
    await expect(collect()).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1][0]).toBe("same");
  });
});
