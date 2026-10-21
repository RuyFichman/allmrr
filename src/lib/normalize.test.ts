import { describe, expect, it } from "vitest";
import { normalizeUrl, normalizeXHandle, slugify, uniqueSlug } from "./normalize";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Pipeline Pilot")).toBe("pipeline-pilot");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("  Café Ops! (beta) ")).toBe("cafe-ops-beta");
  });

  it("collapses repeated separators", () => {
    expect(slugify("a -- b__c")).toBe("a-b-c");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("startup");
    expect(slugify("日本語")).toBe("startup");
  });

  it("caps the length without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("keeps the base when it is free", () => {
    expect(uniqueSlug("acme", ["other"])).toBe("acme");
  });

  it("adds -2 on the first collision", () => {
    expect(uniqueSlug("acme", ["acme"])).toBe("acme-2");
  });

  it("finds the next free suffix", () => {
    expect(uniqueSlug("acme", ["acme", "acme-2", "acme-3"])).toBe("acme-4");
  });

  it("ignores unrelated slugs with the same prefix", () => {
    expect(uniqueSlug("acme", ["acme", "acme-labs"])).toBe("acme-2");
  });
});

describe("normalizeUrl", () => {
  it("adds https:// when missing", () => {
    expect(normalizeUrl("acme.com")).toBe("https://acme.com");
  });

  it("keeps existing schemes and paths", () => {
    expect(normalizeUrl("http://acme.com/pricing?x=1")).toBe("http://acme.com/pricing?x=1");
    expect(normalizeUrl("HTTPS://Acme.com/")).toBe("https://acme.com");
  });

  it("trims whitespace", () => {
    expect(normalizeUrl("  www.acme.io  ")).toBe("https://www.acme.io");
  });

  it("rejects empty, non-web and host-less input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://acme.com")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("normalizeXHandle", () => {
  it.each([
    ["acme", "acme"],
    ["@acme", "acme"],
    ["  @Acme_HQ ", "Acme_HQ"],
    ["x.com/acme", "acme"],
    ["https://x.com/acme", "acme"],
    ["https://www.twitter.com/acme?s=20", "acme"],
    ["https://mobile.twitter.com/acme/status/1", "acme"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeXHandle(input)).toBe(expected);
  });

  it("rejects invalid handles", () => {
    expect(normalizeXHandle("")).toBeNull();
    expect(normalizeXHandle("has space")).toBeNull();
    expect(normalizeXHandle("way_too_long_handle_123")).toBeNull();
    expect(normalizeXHandle("https://example.com/acme")).toBeNull();
  });
});
