import { describe, expect, it } from "vitest";
import { suggestBusinessModel } from "./classification";

describe("suggestBusinessModel", () => {
  it("suggests micro-saas for a small team under $50k MRR", () => {
    expect(suggestBusinessModel({ declaredSlug: "saas", teamSize: 2, mrrCents: 1_000_000 })).toBe("micro-saas");
  });

  it("suggests saas when the team is larger than 3", () => {
    expect(suggestBusinessModel({ declaredSlug: "micro-saas", teamSize: 4, mrrCents: 0 })).toBe("saas");
  });

  it("keeps a team of exactly 3 in micro-saas", () => {
    expect(suggestBusinessModel({ declaredSlug: "micro-saas", teamSize: 3 })).toBe("micro-saas");
  });

  it("suggests saas at exactly $50k MRR", () => {
    expect(suggestBusinessModel({ declaredSlug: "micro-saas", teamSize: 1, mrrCents: 5_000_000 })).toBe("saas");
    expect(suggestBusinessModel({ declaredSlug: "micro-saas", teamSize: 1, mrrCents: 4_999_999 })).toBe(
      "micro-saas"
    );
  });

  it("treats missing MRR as zero", () => {
    expect(suggestBusinessModel({ declaredSlug: "saas", teamSize: 1, mrrCents: null })).toBe("micro-saas");
  });

  it("keeps any other declared model", () => {
    expect(suggestBusinessModel({ declaredSlug: "oaas", teamSize: 50, mrrCents: 90_000_000 })).toBe("oaas");
    expect(suggestBusinessModel({ declaredSlug: "marketplace", teamSize: 1 })).toBe("marketplace");
  });
});
