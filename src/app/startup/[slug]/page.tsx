import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheckIcon, ExternalLinkIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StartupLogo } from "@/components/startup-logo";
import { getPublicStartup, getPublishedSlugs } from "@/lib/data/startups";
import { formatPercent, formatUsd } from "@/lib/format";

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  // Cache Components needs at least one param; an unknown slug renders notFound().
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: PageProps<"/startup/[slug]">): Promise<Metadata> {
  const startup = await getPublicStartup((await params).slug);
  if (!startup) return {};
  return {
    title: startup.name,
    description: startup.tagline ?? `${startup.name} on AllMRR.`,
  };
}

export default async function StartupPage({ params }: PageProps<"/startup/[slug]">) {
  const startup = await getPublicStartup((await params).slug);
  if (!startup) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <StartupLogo name={startup.name} logoUrl={startup.logo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-tight">
            {startup.name}
            {startup.is_verified && (
              <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
                <BadgeCheckIcon data-icon="inline-start" aria-hidden="true" />
                Verified
              </Badge>
            )}
          </h1>
          {startup.tagline && <p className="mt-1 text-lg text-muted-foreground">{startup.tagline}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="secondary" render={<Link href={`/${startup.model.slug}`} />}>
              {startup.model.name}
            </Badge>
            {startup.niche && (
              <Badge variant="outline" render={<Link href={`/startups?niche=${startup.niche.slug}`} />}>
                {startup.niche.name}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<a href={startup.website_url} target="_blank" rel="noopener noreferrer" />}
        >
          Website
          <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
        {startup.x_handle && (
          <Button
            variant="outline"
            size="sm"
            render={<a href={`https://x.com/${startup.x_handle}`} target="_blank" rel="noopener noreferrer" />}
          >
            @{startup.x_handle}
          </Button>
        )}
      </div>

      <section aria-labelledby="revenue-heading" className="mt-10">
        <h2 id="revenue-heading" className="text-lg font-semibold">
          Revenue
        </h2>
        {startup.mrrCents !== null ? (
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric label="MRR" value={formatUsd(startup.mrrCents)} />
            <Metric label="Total revenue" value={formatUsd(startup.revenueTotalCents ?? 0)} />
            <Metric
              label="Last 30 days"
              value={startup.growth30dPct !== null ? formatPercent(startup.growth30dPct) : "—"}
            />
          </dl>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Not verified yet. Revenue appears once the founder connects a payment provider.
          </p>
        )}
        {startup.revenueAsOf && (
          <p className="mt-2 text-xs text-muted-foreground">As of {startup.revenueAsOf}.</p>
        )}
      </section>

      {startup.description && (
        <section aria-labelledby="about-heading" className="mt-10">
          <h2 id="about-heading" className="text-lg font-semibold">
            About
          </h2>
          <p className="mt-3 whitespace-pre-line text-muted-foreground">{startup.description}</p>
        </section>
      )}

      <section aria-labelledby="founders-heading" className="mt-10">
        <h2 id="founders-heading" className="text-lg font-semibold">
          Founders
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {startup.founders.map(({ role, profile }) => {
            const name = profile.display_name ?? profile.username;
            return (
              <li key={profile.username} className="flex items-center gap-3">
                <Avatar>
                  {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                  <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">
                    {role === "cofounder" ? "Cofounder" : "Founder"}
                    {profile.x_handle && (
                      <>
                        {" · "}
                        <a
                          href={`https://x.com/${profile.x_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          @{profile.x_handle}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {(startup.founded_on || startup.team_size) && (
        <p className="mt-10 text-sm text-muted-foreground">
          {startup.founded_on && <>Founded {startup.founded_on.slice(0, 4)} · </>}
          Team of {startup.team_size}
        </p>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
