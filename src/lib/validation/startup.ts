import { z } from "zod";
import { normalizeUrl, normalizeXHandle } from "@/lib/normalize";

export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

// Parses raw FormData strings into the shape the `startups` table expects.
export const startupFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Keep the name under 80 characters."),
  tagline: z
    .string()
    .trim()
    .min(1, "Add a one-line tagline.")
    .max(80, "Keep the tagline under 80 characters."),
  description: optionalText(5000, "Keep the description under 5,000 characters."),
  websiteUrl: z
    .string()
    .trim()
    .min(1, "Website is required.")
    .transform((value, ctx) => {
      const url = normalizeUrl(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Enter a valid website, like acme.com." });
        return z.NEVER;
      }
      return url;
    }),
  xHandle: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (!value) return null;
      const handle = normalizeXHandle(value);
      if (!handle) {
        ctx.addIssue({ code: "custom", message: "Enter an X handle like @acme or an x.com link." });
        return z.NEVER;
      }
      return handle;
    }),
  businessModelId: z.uuid("Pick a business model."),
  nicheId: z.union([z.uuid("Pick a niche."), z.literal("").transform(() => null)]),
  foundedOn: z.union([
    z.iso
      .date("Enter a valid date.")
      .refine((value) => value <= new Date().toISOString().slice(0, 10), "The date can't be in the future."),
    z.literal("").transform(() => null),
  ]),
  teamSize: z.coerce
    .number("Enter a number.")
    .int("Enter a whole number.")
    .min(1, "Team size is at least 1.")
    .max(100_000, "That team is too big for us."),
  status: z.enum(["draft", "published"], "Choose draft or published."),
});

// Raw form values are always strings, whatever the schema coerces them into.
export type StartupFormInput = Record<keyof z.input<typeof startupFormSchema>, string>;
export type StartupFormValues = z.output<typeof startupFormSchema>;
export type StartupField = keyof StartupFormInput | "logo";

export function readStartupForm(formData: FormData): StartupFormInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    tagline: text("tagline"),
    description: text("description"),
    websiteUrl: text("websiteUrl"),
    xHandle: text("xHandle"),
    businessModelId: text("businessModelId"),
    nicheId: text("nicheId"),
    foundedOn: text("foundedOn"),
    teamSize: text("teamSize"),
    status: text("status"),
  };
}

// Returns an error message, or null when the file is acceptable (or absent).
export function validateLogo(file: { size: number; type: string } | null) {
  if (!file || file.size === 0) return null;
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Use a PNG, JPEG, WebP or SVG image.";
  }
  if (file.size > MAX_LOGO_BYTES) return "The logo must be 1 MB or smaller.";
  return null;
}
