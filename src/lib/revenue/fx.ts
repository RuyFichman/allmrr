import type { FxTable } from "./types";

// ISO 4217 currencies Stripe treats as zero- or three-decimal.
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export class MissingFxRateError extends Error {
  constructor(
    readonly currency: string,
    readonly day: string
  ) {
    super(`No FX rate for ${currency} on or before ${day}.`);
  }
}

export function minorUnitExponent(currency: string) {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

// Rate for `day`, falling back to the nearest previous day (weekends, holidays).
export function usdRateOn(fx: FxTable, currency: string, day: string) {
  const code = currency.toUpperCase();
  if (code === "USD") return 1;
  const series = fx[code];
  if (!series?.length || series[0][0] > day) throw new MissingFxRateError(code, day);

  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (series[mid][0] <= day) lo = mid;
    else hi = mid - 1;
  }
  return series[lo][1];
}

// Minor units of `currency` -> (unrounded) USD cents.
export function toUsdCents(amountMinor: number, currency: string, fx: FxTable, day: string) {
  const major = amountMinor / 10 ** minorUnitExponent(currency);
  return major * usdRateOn(fx, currency, day) * 100;
}

export function buildFxTable(rows: Array<{ date: string; currency: string; usd_rate: number | string }>): FxTable {
  const table: FxTable = {};
  for (const row of rows) {
    (table[row.currency.toUpperCase()] ??= []).push([row.date, Number(row.usd_rate)]);
  }
  for (const series of Object.values(table)) series.sort((a, b) => a[0].localeCompare(b[0]));
  return table;
}
