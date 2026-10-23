import { expect, it } from "vitest";
import { redactSecrets } from "./redact";

it("redacts opaque credentials and authorization fields", () => {
  expect(redactSecrets("failure: opaque-secret", ["opaque-secret"])).toBe("failure: [redacted]");
  expect(redactSecrets("Bearer abc.def.ghi api_key=opaque&next=1")).toBe("Bearer [redacted] api_key=[redacted]&next=1");
});
