import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBusinessModels, getNiches } from "@/lib/data/taxonomy";
import { createClient } from "@/lib/supabase/server";
import { updateStartup } from "../../actions";
import { StartupForm } from "../../startup-form";

export const metadata: Metadata = { title: "Edit startup" };

export default function EditStartupPage({ params, searchParams }: PageProps<"/dashboard/startups/[slug]/edit">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Edit startup</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-muted" />}>
        <EditForm params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EditForm({ params, searchParams }: PageProps<"/dashboard/startups/[slug]/edit">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect(`/login?next=/dashboard/startups/${slug}/edit`);

  // Published startups are readable by anyone, so scope explicitly to the user's own.
  const { data: membership } = await supabase
    .from("startup_founders")
    .select(
      `startup:startups!inner (id, slug, name, tagline, description, website_url, logo_url, x_handle,
        founded_on, team_size, niche_id, declared_business_model_id, status)`
    )
    .eq("profile_id", userId)
    .eq("startup.slug", slug)
    .maybeSingle();
  const startup = membership?.startup;
  if (!startup) notFound();

  const [models, niches, { data: latest }] = await Promise.all([
    getBusinessModels(),
    getNiches(),
    supabase
      .from("revenue_snapshots")
      .select("mrr_cents")
      .eq("startup_id", startup.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="mt-8 flex flex-col gap-6">
      {query.logo === "failed" && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Your startup was created, but the logo upload failed. Try uploading it again.
        </p>
      )}
      {startup.status === "hidden" && (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm">
          This startup is hidden by moderation. Your edits are saved but it stays hidden.
        </p>
      )}
      <StartupForm
        action={updateStartup.bind(null, startup.id)}
        models={models}
        niches={niches}
        latestMrrCents={latest?.mrr_cents ?? null}
        submitLabel="Save changes"
        defaults={{
          name: startup.name,
          tagline: startup.tagline ?? "",
          description: startup.description ?? "",
          websiteUrl: startup.website_url,
          xHandle: startup.x_handle ?? "",
          businessModelId: startup.declared_business_model_id,
          nicheId: startup.niche_id ?? "",
          foundedOn: startup.founded_on ?? "",
          teamSize: String(startup.team_size),
          status: startup.status === "published" ? "published" : "draft",
          logoUrl: startup.logo_url,
        }}
      />
    </div>
  );
}
