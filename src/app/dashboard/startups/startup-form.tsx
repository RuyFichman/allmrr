"use client";

import { startTransition, useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { LightbulbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { StartupLogo } from "@/components/startup-logo";
import { suggestBusinessModel } from "@/lib/classification";
import type { BusinessModel, Niche } from "@/lib/data/taxonomy";
import { formatUsdCompact } from "@/lib/format";
import { LOGO_MIME_TYPES, validateLogo, type StartupField } from "@/lib/validation/startup";
import type { StartupFormState } from "./actions";

export type StartupFormDefaults = {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  xHandle: string;
  businessModelId: string;
  nicheId: string;
  foundedOn: string;
  teamSize: string;
  status: string;
  logoUrl: string | null;
};

const EMPTY: StartupFormDefaults = {
  name: "",
  tagline: "",
  description: "",
  websiteUrl: "",
  xHandle: "",
  businessModelId: "",
  nicheId: "",
  foundedOn: "",
  teamSize: "1",
  status: "draft",
  logoUrl: null,
};

type Props = {
  action: (state: StartupFormState, formData: FormData) => Promise<StartupFormState>;
  models: BusinessModel[];
  niches: Niche[];
  defaults?: StartupFormDefaults;
  latestMrrCents?: number | null;
  submitLabel: string;
};

export function StartupForm({ action, models, niches, defaults = EMPTY, latestMrrCents, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [modelId, setModelId] = useState(defaults.businessModelId);
  const [teamSize, setTeamSize] = useState(defaults.teamSize);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!logoPreview) return;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  // Values echoed back by the server, for submissions made before hydration.
  const value = (field: Exclude<keyof StartupFormDefaults, "logoUrl">) => state.values?.[field] ?? defaults[field];
  const errorFor = (field: StartupField) =>
    field === "logo" && logoError ? logoError : state.errors?.[field]?.[0];

  const model = models.find((m) => m.id === modelId);
  const suggestedSlug = model
    ? suggestBusinessModel({ declaredSlug: model.slug, teamSize: Number(teamSize) || 1, mrrCents: latestMrrCents })
    : null;
  const suggested = suggestedSlug && suggestedSlug !== model?.slug ? models.find((m) => m.slug === suggestedSlug) : null;

  return (
    <form
      action={formAction}
      // Submitting through a transition keeps the fields (and the logo file) after a validation error.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      {state.message && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Field id="name" label="Name" error={errorFor("name")}>
        {(a11y) => <Input id="name" name="name" defaultValue={value("name")} maxLength={80} required {...a11y} />}
      </Field>

      <Field id="tagline" label="Tagline" hint="One line, up to 80 characters." error={errorFor("tagline")}>
        {(a11y) => (
          <Input id="tagline" name="tagline" defaultValue={value("tagline")} maxLength={80} required {...a11y} />
        )}
      </Field>

      <Field id="websiteUrl" label="Website" hint="We add https:// for you." error={errorFor("websiteUrl")}>
        {(a11y) => (
          <Input
            id="websiteUrl"
            name="websiteUrl"
            defaultValue={value("websiteUrl")}
            inputMode="url"
            autoComplete="url"
            placeholder="acme.com"
            required
            {...a11y}
          />
        )}
      </Field>

      <Field id="description" label="Description" optional error={errorFor("description")}>
        {(a11y) => (
          <Textarea
            id="description"
            name="description"
            defaultValue={value("description")}
            rows={5}
            maxLength={5000}
            {...a11y}
          />
        )}
      </Field>

      <Field
        id="logo"
        label="Logo"
        optional
        hint="PNG, JPEG, WebP or SVG, up to 1 MB."
        error={errorFor("logo")}
      >
        {(a11y) => (
          <div className="flex items-center gap-4">
            <StartupLogo name={value("name") || "?"} logoUrl={logoPreview ?? defaults.logoUrl} size="lg" />
            <Input
              id="logo"
              name="logo"
              type="file"
              accept={LOGO_MIME_TYPES.join(",")}
              className="h-auto py-1.5"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                const error = validateLogo(file);
                setLogoError(error);
                if (error) event.currentTarget.value = "";
                setLogoPreview(file && !error ? URL.createObjectURL(file) : null);
              }}
              {...a11y}
            />
          </div>
        )}
      </Field>

      <Field
        id="businessModelId"
        label="Business model"
        hint={model ? model.criteria : "How the startup makes money."}
        error={errorFor("businessModelId")}
      >
        {(a11y) => (
          <NativeSelect
            id="businessModelId"
            name="businessModelId"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            className="w-full"
            required
            {...a11y}
          >
            <NativeSelectOption value="" disabled>
              Select a model
            </NativeSelectOption>
            {models.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </Field>

      {suggested && model && (
        <p role="status" className="flex gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
          <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>
            With a team of {Number(teamSize) || 1}
            {latestMrrCents ? ` and ${formatUsdCompact(latestMrrCents)} MRR` : ""}, this looks more like{" "}
            <strong>{suggested.name}</strong>. You can keep {model.name}; we review every classification.
          </span>
        </p>
      )}

      <Field id="nicheId" label="Niche" optional error={errorFor("nicheId")}>
        {(a11y) => (
          <NativeSelect id="nicheId" name="nicheId" defaultValue={value("nicheId")} className="w-full" {...a11y}>
            <NativeSelectOption value="">No niche</NativeSelectOption>
            {niches.map((n) => (
              <NativeSelectOption key={n.id} value={n.id}>
                {n.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="xHandle" label="X handle" optional hint="@handle or x.com link." error={errorFor("xHandle")}>
          {(a11y) => (
            <Input id="xHandle" name="xHandle" defaultValue={value("xHandle")} placeholder="@acme" {...a11y} />
          )}
        </Field>
        <Field id="foundedOn" label="Founded" optional error={errorFor("foundedOn")}>
          {(a11y) => <Input id="foundedOn" name="foundedOn" type="date" defaultValue={value("foundedOn")} {...a11y} />}
        </Field>
      </div>

      <Field id="teamSize" label="Team size" hint="Including founders." error={errorFor("teamSize")}>
        {(a11y) => (
          <Input
            id="teamSize"
            name="teamSize"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={teamSize}
            onChange={(event) => setTeamSize(event.target.value)}
            className="w-32"
            required
            {...a11y}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-2" aria-describedby={errorFor("status") ? "status-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Visibility</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <StatusOption value="draft" defaultChecked={value("status") === "draft"} title="Draft">
            Only you and your cofounders can see it.
          </StatusOption>
          <StatusOption value="published" defaultChecked={value("status") === "published"} title="Published">
            Listed publicly on AllMRR.
          </StatusOption>
        </div>
        {errorFor("status") && (
          <p id="status-error" className="text-sm text-destructive">
            {errorFor("status")}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" render={<Link href="/dashboard" />}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

type A11yProps = { "aria-invalid"?: true; "aria-describedby"?: string };

function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (a11y: A11yProps) => ReactNode;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children({
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function StatusOption({
  value,
  title,
  defaultChecked,
  children,
}: {
  value: "draft" | "published";
  title: string;
  defaultChecked: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
      <input type="radio" name="status" value={value} defaultChecked={defaultChecked} className="mt-0.5 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}
