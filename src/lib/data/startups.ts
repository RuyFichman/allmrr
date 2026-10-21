import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Tables } from "@/lib/supabase/database.types";
import { TAGS } from "./cache-tags";

export const PAGE_SIZE = 12;

export type StartupSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  isVerified: boolean;
  model: { slug: string; name: string };
  niche: { slug: string; name: string } | null;
  mrrCents: number | null;
  revenueTotalCents: number | null;
  growth30dPct: number | null;
};

// The view's columns are all nullable in the generated types; published rows always
// have id, slug, name and a model, so they are narrowed here.
function toSummary(row: Tables<"startup_directory">): StartupSummary {
  return {
    id: row.id!,
    slug: row.slug!,
    name: row.name!,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    isVerified: row.is_verified ?? false,
    model: { slug: row.business_model_slug!, name: row.business_model_name! },
    niche: row.niche_slug ? { slug: row.niche_slug, name: row.niche_name! } : null,
    mrrCents: row.mrr_cents,
    revenueTotalCents: row.revenue_total_cents,
    growth30dPct: row.growth_30d_pct,
  };
}

type ListOptions = { model?: string; niche?: string; page?: number };

export async function getPublishedStartups({ model, niche, page = 1 }: ListOptions) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.startups);

  const from = (page - 1) * PAGE_SIZE;
  let query = createPublicClient()
    .from("startup_directory")
    .select("*", { count: "exact" })
    .order("published_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (model) query = query.eq("business_model_slug", model);
  if (niche) query = query.eq("niche_slug", niche);

  const { data, count, error } = await query;
  // PostgREST answers 416 when the page is past the end; treat it as empty.
  if (error && error.code !== "PGRST103") {
    throw new Error(`Failed to load startups: ${error.message}`);
  }

  const total = count ?? 0;
  return {
    startups: (data ?? []).map(toSummary),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getRecentStartups(limit = 6) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.startups);

  const { data, error } = await createPublicClient()
    .from("startup_directory")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load recent startups: ${error.message}`);
  return data.map(toSummary);
}

export async function getPublishedSlugs(limit = 100) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.startups);

  const { data, error } = await createPublicClient()
    .from("startups")
    .select("slug")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load startup slugs: ${error.message}`);
  return data.map((row) => row.slug);
}

export async function getPublicStartup(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.startups, TAGS.startup(slug));

  const supabase = createPublicClient();
  const [startupResult, metricsResult] = await Promise.all([
    supabase
      .from("startups")
      .select(
        `id, slug, name, tagline, description, website_url, logo_url, x_handle, founded_on, team_size, is_verified,
         model:business_models!startups_business_model_id_fkey (slug, name),
         niche:niches (slug, name),
         founders:startup_founders (role, profile:profiles (username, display_name, avatar_url, x_handle))`
      )
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("startup_directory")
      .select("mrr_cents, revenue_total_cents, growth_30d_pct, revenue_as_of")
      .eq("slug", slug)
      .maybeSingle(),
  ]);

  if (startupResult.error) throw new Error(`Failed to load startup: ${startupResult.error.message}`);
  if (metricsResult.error) throw new Error(`Failed to load metrics: ${metricsResult.error.message}`);
  if (!startupResult.data) return null;

  const metrics = metricsResult.data;
  return {
    ...startupResult.data,
    // "founder" sorts after "cofounder", so descending puts founders first.
    founders: [...startupResult.data.founders].sort((a, b) => b.role.localeCompare(a.role)),
    mrrCents: metrics?.mrr_cents ?? null,
    revenueTotalCents: metrics?.revenue_total_cents ?? null,
    growth30dPct: metrics?.growth_30d_pct ?? null,
    revenueAsOf: metrics?.revenue_as_of ?? null,
  };
}
