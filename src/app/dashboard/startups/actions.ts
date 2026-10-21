"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/data/cache-tags";
import { slugify, uniqueSlug } from "@/lib/normalize";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  readStartupForm,
  startupFormSchema,
  validateLogo,
  type StartupField,
  type StartupFormInput,
  type StartupFormValues,
} from "@/lib/validation/startup";

export type StartupFormState = {
  errors?: Partial<Record<StartupField, string[]>>;
  message?: string;
  values?: StartupFormInput;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const SLUG_ATTEMPTS = 5;
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function createStartup(_prev: StartupFormState, formData: FormData): Promise<StartupFormState> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { message: "Your session expired. Sign in again to continue." };

  const form = parseForm(formData);
  if (!form.ok) return form.state;

  // Drafts by other founders are hidden by RLS, so a visible-slug check can still
  // collide; the unique index is the source of truth and we retry with a suffix.
  const base = slugify(form.data.name);
  const { data: existing } = await supabase.from("startups").select("slug").like("slug", `${base}%`);
  const taken = (existing ?? []).map((row) => row.slug);

  let created: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS && !created; attempt++) {
    const slug = uniqueSlug(base, taken);
    const { data, error } = await supabase
      .from("startups")
      // business_model_id is filled by a trigger and is not client-writable, so it is omitted.
      .insert({ ...toRow(form.data), slug, created_by: userId } as TablesInsert<"startups">)
      .select("id, slug")
      .single();
    if (data) created = data;
    else if (error?.code === "23505") taken.push(slug);
    else break;
  }
  if (!created) {
    return { values: form.values, message: "We couldn't save your startup. Please try again." };
  }

  const logoSaved = form.logo ? await replaceLogo(supabase, created.id, form.logo) : true;

  updateTag(TAGS.startups);
  updateTag(TAGS.startup(created.slug));
  redirect(logoSaved ? "/dashboard" : `/dashboard/startups/${created.slug}/edit?logo=failed`);
}

export async function updateStartup(
  startupId: string,
  _prev: StartupFormState,
  formData: FormData
): Promise<StartupFormState> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { message: "Your session expired. Sign in again to continue." };

  const form = parseForm(formData);
  if (!form.ok) return form.state;

  // RLS limits updates to founders; no row back means not found or not allowed.
  const { data: updated, error } = await supabase
    .from("startups")
    .update(toRow(form.data))
    .eq("id", startupId)
    .select("id, slug")
    .maybeSingle();
  if (error || !updated) {
    return { values: form.values, message: "We couldn't save your changes. Please try again." };
  }

  if (form.logo && !(await replaceLogo(supabase, updated.id, form.logo))) {
    updateTag(TAGS.startups);
    updateTag(TAGS.startup(updated.slug));
    return { values: form.values, errors: { logo: ["Your changes were saved, but the logo upload failed."] } };
  }

  updateTag(TAGS.startups);
  updateTag(TAGS.startup(updated.slug));
  redirect("/dashboard");
}

async function currentUserId(supabase: SupabaseServerClient) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

function parseForm(formData: FormData) {
  const values = readStartupForm(formData);
  const parsed = startupFormSchema.safeParse(values);
  const rawLogo = formData.get("logo");
  const logo = rawLogo instanceof File && rawLogo.size > 0 ? rawLogo : null;
  const logoError = validateLogo(logo);

  if (!parsed.success || logoError) {
    const errors: StartupFormState["errors"] = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
    if (logoError) errors.logo = [logoError];
    return { ok: false as const, state: { values, errors } satisfies StartupFormState };
  }
  return { ok: true as const, data: parsed.data, values, logo };
}

// Only founder-editable columns; the effective model, review status and
// verification are system-owned and protected by column privileges.
function toRow(data: StartupFormValues) {
  return {
    name: data.name,
    tagline: data.tagline,
    description: data.description,
    website_url: data.websiteUrl,
    x_handle: data.xHandle,
    declared_business_model_id: data.businessModelId,
    niche_id: data.nicheId,
    founded_on: data.foundedOn,
    team_size: data.teamSize,
    status: data.status,
  };
}

// Uploads under `{startup_id}/`, points logo_url at it and removes older files.
async function replaceLogo(supabase: SupabaseServerClient, startupId: string, file: File) {
  const bucket = supabase.storage.from("logos");
  const path = `${startupId}/logo-${Date.now()}.${LOGO_EXTENSIONS[file.type]}`;

  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type });
  if (uploadError) return false;

  const { publicUrl } = bucket.getPublicUrl(path).data;
  const { error: updateError } = await supabase.from("startups").update({ logo_url: publicUrl }).eq("id", startupId);
  if (updateError) return false;

  const { data: files } = await bucket.list(startupId);
  const stale = (files ?? []).map((f) => `${startupId}/${f.name}`).filter((p) => p !== path);
  if (stale.length > 0) await bucket.remove(stale);
  return true;
}
