import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { TAGS } from "./cache-tags";

export type BusinessModel = {
  id: string;
  slug: string;
  name: string;
  description: string;
  criteria: string;
};

export type Niche = { id: string; slug: string; name: string };

export async function getBusinessModels(): Promise<BusinessModel[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.taxonomy);

  const { data, error } = await createPublicClient()
    .from("business_models")
    .select("id, slug, name, description, criteria")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Failed to load business models: ${error.message}`);
  return data;
}

export async function getBusinessModel(slug: string) {
  const models = await getBusinessModels();
  return models.find((model) => model.slug === slug) ?? null;
}

export async function getNiches(): Promise<Niche[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.taxonomy);

  const { data, error } = await createPublicClient()
    .from("niches")
    .select("id, slug, name")
    .order("name");
  if (error) throw new Error(`Failed to load niches: ${error.message}`);
  return data;
}
