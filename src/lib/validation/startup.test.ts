import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_LOGO_BYTES, readStartupForm, startupFormSchema, validateLogo, type StartupFormInput } from "./startup";

const MODEL_ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const NICHE_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const valid: StartupFormInput = {
  name: "  Acme  ",
  tagline: "Invoices that chase themselves",
  description: "",
  websiteUrl: "acme.com",
  xHandle: "@acme",
  businessModelId: MODEL_ID,
  nicheId: NICHE_ID,
  foundedOn: "2024-02-29",
  teamSize: "2",
  status: "published",
};

function errorsFor(input: StartupFormInput) {
  const result = startupFormSchema.safeParse(input);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe("startupFormSchema", () => {
  it("parses and normalizes a valid form", () => {
    expect(startupFormSchema.parse(valid)).toEqual({
      name: "Acme",
      tagline: "Invoices that chase themselves",
      description: null,
      websiteUrl: "https://acme.com",
      xHandle: "acme",
      businessModelId: MODEL_ID,
      nicheId: NICHE_ID,
      foundedOn: "2024-02-29",
      teamSize: 2,
      status: "published",
    });
  });

  it("turns empty optional fields into null", () => {
    const parsed = startupFormSchema.parse({ ...valid, xHandle: "", nicheId: "", foundedOn: "" });
    expect(parsed).toMatchObject({ xHandle: null, nicheId: null, foundedOn: null });
  });

  it("requires name, tagline, website and model", () => {
    const errors = errorsFor({ ...valid, name: " ", tagline: "", websiteUrl: "", businessModelId: "" });
    expect(Object.keys(errors).sort()).toEqual(["businessModelId", "name", "tagline", "websiteUrl"]);
  });

  it("limits the tagline to 80 characters", () => {
    expect(errorsFor({ ...valid, tagline: "x".repeat(81) }).tagline).toBeDefined();
    expect(errorsFor({ ...valid, tagline: "x".repeat(80) }).tagline).toBeUndefined();
  });

  it("rejects invalid websites and handles", () => {
    const errors = errorsFor({ ...valid, websiteUrl: "not a url", xHandle: "has space" });
    expect(errors.websiteUrl).toBeDefined();
    expect(errors.xHandle).toBeDefined();
  });

  it("validates team size", () => {
    expect(errorsFor({ ...valid, teamSize: "0" }).teamSize).toBeDefined();
    expect(errorsFor({ ...valid, teamSize: "2.5" }).teamSize).toBeDefined();
    expect(errorsFor({ ...valid, teamSize: "abc" }).teamSize).toBeDefined();
  });

  it("rejects future and malformed founding dates", () => {
    expect(errorsFor({ ...valid, foundedOn: "2999-01-01" }).foundedOn).toBeDefined();
    expect(errorsFor({ ...valid, foundedOn: "2024-13-01" }).foundedOn).toBeDefined();
  });

  it("only accepts draft or published", () => {
    expect(errorsFor({ ...valid, status: "hidden" }).status).toBeDefined();
  });
});

describe("readStartupForm", () => {
  it("reads strings and defaults missing fields to empty", () => {
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("logo", new Blob(["x"]));
    expect(readStartupForm(formData)).toMatchObject({ name: "Acme", tagline: "", status: "" });
  });
});

describe("validateLogo", () => {
  it("accepts no file", () => {
    expect(validateLogo(null)).toBeNull();
    expect(validateLogo({ size: 0, type: "" })).toBeNull();
  });

  it("accepts the allowed image types up to 1 MB", () => {
    expect(validateLogo({ size: MAX_LOGO_BYTES, type: "image/png" })).toBeNull();
    expect(validateLogo({ size: 10, type: "image/svg+xml" })).toBeNull();
  });

  it("rejects other types and larger files", () => {
    expect(validateLogo({ size: 10, type: "image/gif" })).not.toBeNull();
    expect(validateLogo({ size: MAX_LOGO_BYTES + 1, type: "image/webp" })).not.toBeNull();
  });
});
