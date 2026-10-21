import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Pagination } from "@/components/pagination";
import { StartupGrid } from "@/components/startup-card";
import { getPublishedStartups } from "@/lib/data/startups";
import { getBusinessModels, getNiches } from "@/lib/data/taxonomy";

type Props = {
  basePath: string;
  model?: string;
  niche?: string;
  page: number;
  // On /[model] pages the model is fixed by the route, so only the niche filter is shown.
  showModelFilter?: boolean;
};

export async function StartupListing({ basePath, model, niche, page, showModelFilter = true }: Props) {
  const [models, niches, result] = await Promise.all([
    getBusinessModels(),
    getNiches(),
    getPublishedStartups({ model, niche, page }),
  ]);

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (showModelFilter && model) params.set("model", model);
    if (niche) params.set("niche", niche);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <>
      {/* A plain GET form: filters work without JavaScript and stay shareable as URLs. */}
      <form action={basePath} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        {showModelFilter && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-model">Business model</Label>
            <NativeSelect id="filter-model" name="model" defaultValue={model ?? ""} className="w-full sm:w-56">
              <NativeSelectOption value="">All models</NativeSelectOption>
              {models.map((m) => (
                <NativeSelectOption key={m.slug} value={m.slug}>
                  {m.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-niche">Niche</Label>
          <NativeSelect id="filter-niche" name="niche" defaultValue={niche ?? ""} className="w-full sm:w-56">
            <NativeSelectOption value="">All niches</NativeSelectOption>
            {niches.map((n) => (
              <NativeSelectOption key={n.slug} value={n.slug}>
                {n.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
        {result.total === 1 ? "1 startup" : `${result.total} startups`}
      </p>
      <StartupGrid startups={result.startups} />
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={hrefFor} />
    </>
  );
}

export function firstParam(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : undefined;
}
