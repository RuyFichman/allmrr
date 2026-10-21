"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STRIPE_API_KEYS_URL,
  STRIPE_TEST_API_KEYS_URL,
  type StripePermission,
} from "@/lib/revenue/providers/stripe-permissions";
import { connectStripe, type RevenueActionState } from "../../revenue-actions";

type Props = {
  startupId: string;
  permissions: StripePermission[];
  testMode: boolean;
  wasDisconnected: boolean;
};

export function ConnectStripeForm({ startupId, permissions, testMode, wasDisconnected }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RevenueActionState, FormData>(
    connectStripe.bind(null, startupId),
    {}
  );

  // On success the server rendered nothing new yet; pull the connected state.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const describedBy = ["stripe-key-hint", state.error && "stripe-key-error"].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-5">
      {wasDisconnected && (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm">
          Stripe was disconnected and its key deleted. Past revenue stays visible as history, but the startup is no
          longer verified.
        </p>
      )}

      <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>
          AllMRR only accepts <strong>restricted keys</strong> with <strong>read</strong> permissions. We can never
          charge, refund or change anything in your Stripe account. Keys are encrypted at rest and you can disconnect
          at any time.
        </p>
      </div>

      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          Open{" "}
          <a
            href={testMode ? STRIPE_TEST_API_KEYS_URL : STRIPE_API_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            API keys in the Stripe Dashboard
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </a>{" "}
          and click <strong>Create restricted key</strong>. Name it <strong>AllMRR</strong>.
        </li>
        <li>
          Set these permissions to <strong>Read</strong> and leave everything else as <strong>None</strong>:
          <ul className="mt-2 flex flex-col gap-1.5">
            {permissions.map((p) => (
              <li key={p.id} className="flex flex-col rounded-md border px-3 py-2 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="font-medium">
                  {p.group} → {p.resource}: Read
                  {!p.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
                </span>
                <span className="text-muted-foreground">{p.purpose}</span>
              </li>
            ))}
          </ul>
        </li>
        <li>Create the key, copy it (it starts with rk_) and paste it below.</li>
      </ol>

      <form action={formAction} className="flex flex-col gap-2" autoComplete="off">
        <Label htmlFor="stripe-key">Restricted key</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="stripe-key"
            name="key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={testMode ? "rk_live_… or rk_test_…" : "rk_live_…"}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={describedBy}
            className="font-mono"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Checking key…" : "Connect Stripe"}
          </Button>
        </div>
        <p id="stripe-key-hint" className="text-sm text-muted-foreground">
          We check each permission with a read-only request before saving anything.
        </p>
        {state.error && (
          <div id="stripe-key-error" role="alert" className="text-sm text-destructive">
            <p>{state.error}</p>
            {state.missing && state.missing.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {state.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {state.ok && state.message && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
