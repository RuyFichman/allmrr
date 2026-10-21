import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StartupLogo } from "@/components/startup-logo";
import { VerifiedBadge } from "@/components/verified-badge";
import type { StartupSummary } from "@/lib/data/startups";
import { formatPercent, formatUsdCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StartupCard({ startup }: { startup: StartupSummary }) {
  return (
    <article className="relative flex h-full flex-col gap-4 rounded-xl border bg-card p-4 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <StartupLogo name={startup.name} logoUrl={startup.logoUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1 font-medium">
            <Link
              href={`/startup/${startup.slug}`}
              className="truncate outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {startup.name}
            </Link>
            {startup.isVerified && (
              <VerifiedBadge providers={startup.verifiedProviders} verifiedAt={startup.verifiedAt} compact />
            )}
          </h3>
          {startup.tagline && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{startup.tagline}</p>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{startup.model.name}</Badge>
        {startup.niche && <Badge variant="outline">{startup.niche.name}</Badge>}
      </div>

      <div className="flex items-baseline justify-between border-t pt-3 text-sm">
        {/* Only verified revenue is shown publicly. */}
        {startup.isVerified && startup.mrrCents !== null ? (
          <>
            <span>
              <span className="font-semibold tabular-nums">{formatUsdCompact(startup.mrrCents)}</span>
              <span className="text-muted-foreground"> MRR</span>
            </span>
            {startup.growth30dPct !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  startup.growth30dPct >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                )}
              >
                {formatPercent(startup.growth30dPct)}
                <span className="sr-only"> in the last 30 days</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Not verified</span>
        )}
      </div>
    </article>
  );
}

export function StartupGrid({ startups }: { startups: StartupSummary[] }) {
  if (startups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        No startups here yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {startups.map((startup) => (
        <li key={startup.id}>
          <StartupCard startup={startup} />
        </li>
      ))}
    </ul>
  );
}

export function StartupGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
