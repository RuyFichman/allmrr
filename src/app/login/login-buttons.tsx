"use client";

import { useState } from "react";
import type { Provider } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "x", label: "Continue with X" },
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

export function LoginButtons({ next }: { next: string }) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          size="lg"
          disabled={pending !== null}
          onClick={() => signIn(p.id)}
        >
          {pending === p.id ? "Redirecting…" : p.label}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
