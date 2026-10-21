// SaaS vs Micro-SaaS boundary, mirrored from `business_models.criteria`.
export const SAAS_TEAM_SIZE_THRESHOLD = 3;
export const SAAS_MRR_THRESHOLD_CENTS = 5_000_000;

type SuggestInput = {
  declaredSlug: string;
  teamSize: number;
  mrrCents?: number | null;
};

// Hybrid classification, step one: rules suggest, the founder's declaration is stored,
// and an admin has the final word (Sprint 8).
export function suggestBusinessModel({ declaredSlug, teamSize, mrrCents }: SuggestInput) {
  if (declaredSlug !== "saas" && declaredSlug !== "micro-saas") return declaredSlug;
  return teamSize > SAAS_TEAM_SIZE_THRESHOLD || (mrrCents ?? 0) >= SAAS_MRR_THRESHOLD_CENTS
    ? "saas"
    : "micro-saas";
}
