import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays } from "./dates";
import { buildFxTable } from "./fx";
import { SyncFailure } from "./failures";

// Frankfurter publishes ECB reference rates: free, keyless, business days only.
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1";

type FrankfurterRange = { rates: Record<string, Record<string, number>> };

async function fetchRange(from: string, to: string, currencies: string[], deadline?: number) {
  const remaining = deadline === undefined ? 15_000 : deadline - Date.now();
  if (remaining <= 0) throw new SyncFailure("The sync time budget was reached. It will be retried later.", "deferred", 60_000);
  const url = `${FRANKFURTER_URL}/${from}..${to}?base=USD&symbols=${currencies.join(",")}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, remaining))), cache: "no-store" });
  if (!response.ok) throw new Error(`FX provider returned ${response.status} for ${currencies.join(",")}.`);
  const body = (await response.json()) as FrankfurterRange;

  const rows: Array<{ date: string; currency: string; usd_rate: number }> = [];
  for (const [date, rates] of Object.entries(body.rates ?? {})) {
    for (const [currency, perUsd] of Object.entries(rates)) {
      // The API answers "1 USD = perUsd units"; we store "1 unit = usd_rate USD".
      if (perUsd > 0) rows.push({ date, currency, usd_rate: 1 / perUsd });
    }
  }
  const missing = currencies.filter((c) => !rows.some((r) => r.currency === c));
  if (missing.length) throw new Error(`No FX rates available for ${missing.join(", ")}.`);
  return rows;
}

// Makes sure fx_rates covers [from, to] for each currency, fetching only what is missing.
// A 7-day pad before `from` lets weekends and holidays fall back to the previous rate.
export async function ensureFxRates(admin: AdminClient, currencies: Iterable<string>, from: string, to: string, deadline?: number) {
  const needed = [...new Set([...currencies].map((c) => c.toUpperCase()))].filter((c) => c !== "USD").sort();
  if (needed.length === 0) return;
  const paddedFrom = addDays(from, -7);

  const { data, error } = await admin
    .from("fx_rates")
    .select("currency, date")
    .in("currency", needed)
    .gte("date", paddedFrom)
    .lte("date", to)
    .order("date");
  if (error) throw new Error(`Failed to read FX rates: ${error.message}`);

  const stale = needed.filter((currency) => {
    const dates = data.filter((r) => r.currency === currency).map((r) => r.date);
    // Covered when we have a rate within the first pad week and one within 4 days of `to`.
    return !dates.length || dates[0] > addDays(paddedFrom, 6) || dates[dates.length - 1] < addDays(to, -4);
  });
  if (stale.length === 0) return;

  const rows = await fetchRange(paddedFrom, to, stale, deadline);
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: upsertError } = await admin
      .from("fx_rates")
      .upsert(rows.slice(i, i + 1000), { onConflict: "date,currency", ignoreDuplicates: true });
    if (upsertError) throw new Error(`Failed to store FX rates: ${upsertError.message}`);
  }
}

export async function loadFxTable(admin: AdminClient, currencies: Iterable<string>, from: string, to: string) {
  const needed = [...new Set([...currencies].map((c) => c.toUpperCase()))].filter((c) => c !== "USD");
  if (needed.length === 0) return {};

  const rows: Array<{ date: string; currency: string; usd_rate: number }> = [];
  // Page through: PostgREST caps each response.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from("fx_rates")
      .select("date, currency, usd_rate")
      .in("currency", needed)
      .gte("date", addDays(from, -10))
      .lte("date", to)
      .order("date")
      .range(offset, offset + 999);
    if (error) throw new Error(`Failed to load FX rates: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return buildFxTable(rows);
}

// Daily cron: refresh recent rates for every currency we already track.
export async function refreshTrackedFxRates(admin: AdminClient, today: string) {
  const { data, error } = await admin.from("fx_rates").select("currency").gte("date", addDays(today, -60));
  if (error) throw new Error(`Failed to read tracked currencies: ${error.message}`);
  await ensureFxRates(admin, new Set(data.map((r) => r.currency)), addDays(today, -3), today);
}
