import Link from "next/link";
import { BUSINESS_MODELS } from "@/lib/business-models";

export default function Home() {
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
        {BUSINESS_MODELS.map((model) => (
          <li key={model.slug}>
            <Link
              href={`/${model.slug}`}
              className="inline-flex rounded-full border px-3 py-1 text-sm hover:bg-muted"
            >
              {model.name}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Leaderboard coming in Sprint 5.
      </div>
    </div>
  );
}
