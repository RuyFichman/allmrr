import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderAuthError, ProviderRateLimitError } from "./provider-errors";

const state = vi.hoisted(() => ({
  failure: null as unknown,
  priorStats: {} as Record<string, unknown>,
  writes: [] as Array<{ table: string; operation: string; value: Record<string, unknown> }>,
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/crypto/secrets", () => ({ decryptSecret: () => "fixture" }));
vi.mock("./provider-registry", () => ({ getRevenueProvider: () => ({
  async *fetchSubscriptions() { if (state.failure) throw state.failure; yield* []; },
  async *fetchTransactions() { yield* []; },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: state.rpc,
  from(table: string) {
    let operation = "select";
    let value: Record<string, unknown> = {};
    const result = () => {
      if (operation !== "select") state.writes.push({ table, operation, value });
      if (table === "sync_runs") return { data: operation === "insert" ? { id: "run" } : { stats: state.priorStats }, error: null };
      if (table === "revenue_connections") return { data: { id: "connection", startup_id: "startup", provider: "stripe",
        encrypted_credentials: "encrypted", consecutive_failures: 1, startup: { slug: "fixture" } }, error: null };
      return { data: null, error: null };
    };
    const query = {
      select: () => query, eq: () => query, lt: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => result(), single: async () => result(),
      insert: (data: Record<string, unknown>) => { operation = "insert"; value = data; return query; },
      update: (data: Record<string, unknown>) => { operation = "update"; value = data; return query; },
      then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
    };
    return query;
  },
}) }));

import { syncConnection } from "./sync";

describe("sync failure persistence", () => {
  beforeEach(() => {
    state.writes = []; state.priorStats = {}; state.failure = null;
    state.rpc.mockReset().mockResolvedValue({ data: true, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("marks revoked credentials without writing or deleting snapshots", async () => {
    state.failure = new ProviderAuthError();
    expect((await syncConnection("connection", "manual")).status).toBe("failed");
    expect(state.writes.find((w) => w.table === "revenue_connections")?.value)
      .toMatchObject({ status: "revoked", consecutive_failures: 2 });
    expect(state.writes.some((w) => w.table.includes("snapshots"))).toBe(false);
  });
  it("records a rate-limit deferral without incrementing hard failures", async () => {
    state.failure = new ProviderRateLimitError(172800000);
    expect((await syncConnection("connection", "cron")).status).toBe("skipped");
    expect(state.writes.find((w) => w.table === "revenue_connections")?.value.consecutive_failures).toBe(1);
    const run = state.writes.find((w) => w.table === "sync_runs" && w.operation === "update")?.value;
    expect(run?.status).toBe("skipped");
    expect(Date.parse((run?.stats as { retryAt: string }).retryAt)).toBeGreaterThan(Date.now() + 172799000);
    expect(state.writes.some((w) => w.table.includes("snapshots"))).toBe(false);
  });
  it("honors persisted Retry-After on the next manual sync without claiming or writing", async () => {
    state.priorStats = { retryAt: new Date(Date.now() + 60000).toISOString() };
    expect((await syncConnection("connection", "manual")).status).toBe("skipped");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
});
