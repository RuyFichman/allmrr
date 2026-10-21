import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheckIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StartupLogo } from "@/components/startup-logo";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_BADGE: Record<Enums<"startup_status">, { label: string; variant: "default" | "secondary" | "outline" }> = {
  published: { label: "Published", variant: "default" },
  draft: { label: "Draft", variant: "secondary" },
  hidden: { label: "Hidden", variant: "outline" },
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your startups</h1>
        <Button render={<Link href="/dashboard/startups/new" />}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          New startup
        </Button>
      </div>
      <Suspense fallback={<div className="mt-8 h-32 animate-pulse rounded-xl bg-muted" />}>
        <StartupList />
      </Suspense>
    </div>
  );
}

async function StartupList() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login?next=/dashboard");

  const { data: rows, error } = await supabase
    .from("startup_founders")
    .select(
      `role, startup:startups!inner (id, slug, name, tagline, logo_url, status, is_verified, created_at,
        model:business_models!startups_business_model_id_fkey (name))`
    )
    .eq("profile_id", userId);
  if (error) throw new Error(`Failed to load your startups: ${error.message}`);

  const startups = rows
    .map((row) => row.startup)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (startups.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground">You haven&apos;t added a startup yet.</p>
        <Button render={<Link href="/dashboard/startups/new" />}>Add your first startup</Button>
      </div>
    );
  }

  return (
    <ul className="mt-8 divide-y rounded-xl border">
      {startups.map((startup) => {
        const status = STATUS_BADGE[startup.status];
        return (
          <li key={startup.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <StartupLogo name={startup.name} logoUrl={startup.logo_url} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-medium">
                  <span className="truncate">{startup.name}</span>
                  {startup.is_verified && (
                    <BadgeCheckIcon className="size-4 shrink-0 text-emerald-600" aria-label="Verified revenue" />
                  )}
                </p>
                {startup.tagline && <p className="truncate text-sm text-muted-foreground">{startup.tagline}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              <Badge variant="outline">{startup.model.name}</Badge>
              {startup.status === "published" && (
                <Button variant="ghost" size="sm" render={<Link href={`/startup/${startup.slug}`} />}>
                  View<span className="sr-only"> {startup.name}</span>
                </Button>
              )}
              <Button variant="outline" size="sm" render={<Link href={`/dashboard/startups/${startup.slug}/edit`} />}>
                Edit<span className="sr-only"> {startup.name}</span>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
