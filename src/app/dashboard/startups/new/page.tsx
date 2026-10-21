import type { Metadata } from "next";
import { getBusinessModels, getNiches } from "@/lib/data/taxonomy";
import { createStartup } from "../actions";
import { StartupForm } from "../startup-form";

export const metadata: Metadata = { title: "Add a startup" };

// The proxy guards /dashboard and the action re-checks auth, so this page only
// needs cached taxonomy and can be part of the static shell.
export default async function NewStartupPage() {
  const [models, niches] = await Promise.all([getBusinessModels(), getNiches()]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Add your startup</h1>
      <p className="mt-2 text-muted-foreground">
        Start as a draft and publish when you are ready. Revenue verification arrives soon.
      </p>
      <div className="mt-8">
        <StartupForm action={createStartup} models={models} niches={niches} submitLabel="Create startup" />
      </div>
    </div>
  );
}
