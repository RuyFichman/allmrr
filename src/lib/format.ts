const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatUsd(cents: number) {
  return usd.format(cents / 100);
}

export function formatUsdCompact(cents: number) {
  return usdCompact.format(cents / 100);
}

export function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const dateTimeUtc = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

// Server-rendered timestamps use UTC so server and client output always match.
export function formatDateTimeUtc(iso: string) {
  return `${dateTimeUtc.format(new Date(iso))} UTC`;
}
