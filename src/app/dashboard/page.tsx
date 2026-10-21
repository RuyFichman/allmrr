import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Your startups</h1>
      <Suspense fallback={<div className="mt-8 h-32 animate-pulse rounded-xl bg-muted" />}>
        <StartupList />
      </Suspense>
    </div>
  );
}

async function StartupList() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/dashboard");

  return (
    <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      Adding startups arrives in Sprint 1.
    </div>
  );
}
