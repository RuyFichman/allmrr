import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartupGrid } from "@/components/startup-card";
import { getRecentStartups } from "@/lib/data/startups";
import { getBusinessModels } from "@/lib/data/taxonomy";

export default async function Home() {
  const [models, recent] = await Promise.all([getBusinessModels(), getRecentStartups(6)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Verified startup revenue, by business model
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Real MRR pulled straight from payment providers. Compare SaaS with SaaS,
          Micro-SaaS with Micro-SaaS, OaaS with OaaS.
        </p>
      </section>

      <ul className="mt-10 flex flex-wrap gap-2">
        {models.map((model) => (
          <li key={model.slug}>
            <Link
              href={`/${model.slug}`}
              className="inline-flex rounded-full border px-3 py-1 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {model.name}
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="recent-heading" className="mt-14">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-heading" className="text-xl font-semibold tracking-tight">
            Recently added
          </h2>
          <Button variant="ghost" size="sm" render={<Link href="/startups" />}>
            All startups
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
        <StartupGrid startups={recent} />
      </section>
    </div>
  );
}
