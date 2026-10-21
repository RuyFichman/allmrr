import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePage } from "@/components/pagination";
import { StartupGridSkeleton } from "@/components/startup-card";
import { StartupListing, firstParam } from "@/components/startup-listing";
import { getBusinessModel, getBusinessModels } from "@/lib/data/taxonomy";

// Static routes (/login, /dashboard, /startups, /auth, /acquire…) always win over this
// dynamic segment; any other unknown slug falls through to notFound().
export async function generateStaticParams() {
  const models = await getBusinessModels();
  return models.map((model) => ({ model: model.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[model]">): Promise<Metadata> {
  const model = await getBusinessModel((await params).model);
  if (!model) return {};
  return {
    title: `${model.name} startups`,
    description: `${model.description} Ranked by verified revenue on AllMRR.`,
  };
}

export default async function ModelPage({ params, searchParams }: PageProps<"/[model]">) {
  const model = await getBusinessModel((await params).model);
  if (!model) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-sm font-medium text-muted-foreground">Business model</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{model.name}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{model.description}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Criteria:</span> {model.criteria}
      </p>
      <div className="mt-8">
        <Suspense fallback={<StartupGridSkeleton />}>
          <ModelListing model={model.slug} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function ModelListing({
  model,
  searchParams,
}: { model: string } & Pick<PageProps<"/[model]">, "searchParams">) {
  const query = await searchParams;
  return (
    <StartupListing
      basePath={`/${model}`}
      model={model}
      niche={firstParam(query.niche)}
      page={parsePage(query.page)}
      showModelFilter={false}
    />
  );
}
