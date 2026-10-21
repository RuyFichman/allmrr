import { addDays } from "./dates";

// (current - base) / base, in percent. Null when there is no base to compare against.
export function growthPct(current: number | null | undefined, base: number | null | undefined) {
  if (current == null || base == null || base === 0) return null;
  return ((current - base) / base) * 100;
}

// 30-day MRR growth from daily rows: today's MRR vs the latest row on or before 30 days ago.
export function growth30d(rows: Array<{ date: string; mrrCents: number }>, today: string) {
  const current = rows.find((r) => r.date === today)?.mrrCents ?? null;
  const cutoff = addDays(today, -30);
  const base = rows.filter((r) => r.date <= cutoff).sort((a, b) => b.date.localeCompare(a.date))[0]?.mrrCents ?? null;
  return growthPct(current, base);
}
