"use client";

import { BadgeCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTimeUtc } from "@/lib/format";

const PROVIDER_NAMES: Record<string, string> = { stripe: "Stripe" };

type Props = {
  providers: string[];
  verifiedAt: string | null;
  // Icon-only variant for cards.
  compact?: boolean;
};

export function VerifiedBadge({ providers, verifiedAt, compact = false }: Props) {
  const via = providers.map((p) => PROVIDER_NAMES[p] ?? p).join(" + ") || "a payment provider";
  const label = `Verified via ${via}`;
  const detail = verifiedAt ? `Revenue last verified ${formatDateTimeUtc(verifiedAt)}` : "Revenue verified";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          compact ? (
            <span className="relative z-10 inline-flex rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" tabIndex={0} aria-label={`${label}. ${detail}`} />
          ) : (
            <Badge className="bg-emerald-600 text-white dark:bg-emerald-500" tabIndex={0} />
          )
        }
      >
        <BadgeCheckIcon
          className={compact ? "size-4 text-emerald-600 dark:text-emerald-400" : undefined}
          data-icon={compact ? undefined : "inline-start"}
          aria-hidden="true"
        />
        {!compact && label}
      </TooltipTrigger>
      <TooltipContent>{compact ? `${label}. ${detail}` : detail}</TooltipContent>
    </Tooltip>
  );
}
