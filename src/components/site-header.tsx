import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { Button } from "@/components/ui/button";
import { ModelsMenu } from "@/components/models-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { getBusinessModels } from "@/lib/data/taxonomy";
import { createClient } from "@/lib/supabase/server";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          AllMRR
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <Link href="/startups" className="hover:text-foreground">Startups</Link>
          <ModelsNav />
          <Link href="/acquire" className="hover:text-foreground">For sale</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Suspense fallback={<div className="size-8" />}>
            <AccountSlot />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function ModelsNav() {
  "use cache";
  cacheLife("days");

  const models = await getBusinessModels();
  return <ModelsMenu models={models.map(({ slug, name }) => ({ slug, name }))} />;
}

async function AccountSlot() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return (
      <Button size="sm" render={<Link href="/login" />}>
        Add your startup
      </Button>
    );
  }

  const meta = (claims.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.user_name ?? meta.full_name ?? meta.name ?? claims.email ?? "You";
  return <UserMenu name={name} avatarUrl={meta.avatar_url} />;
}
