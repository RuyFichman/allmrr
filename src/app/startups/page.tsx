import { Suspense } from "react";
import type { Metadata } from "next";
import { parsePage } from "@/components/pagination";
import { StartupGridSkeleton } from "@/components/startup-card";
import { StartupListing, firstParam } from "@/components/startup-listing";

export const metadata: Metadata = {
  title: "Startups",
  description: "Browse startups by business model and niche, with verified revenue where available.",
};

export default function StartupsPage({ searchParams }: PageProps<"/startups">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Startups</h1>
      <p className="mt-2 text-muted-foreground">
        Every published startup on AllMRR. Filter by business model or niche.
      </p>
      <div className="mt-8">
        <Suspense fallback={<StartupGridSkeleton />}>
          <FilteredListing searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function FilteredListing({ searchParams }: Pick<PageProps<"/startups">, "searchParams">) {
  const params = await searchParams;
  return (
    <StartupListing
      basePath="/startups"
      model={firstParam(params.model)}
      niche={firstParam(params.niche)}
      page={parsePage(params.page)}
    />
  );
}
