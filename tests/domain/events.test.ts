import { describe, it, expect } from "vitest";
import { notePayloadSchema, progressPayloadSchema, linkPayloadSchema, DEFAULT_CHANNEL } from "../../src/domain/events.js";

describe("payload schemas", () => {
  it("note applies default level 'info'", () => {
    const p = notePayloadSchema.parse({ markdown: "hi" });
    expect(p.level).toBe("info");
  });

  it("progress rejects percent out of range", () => {
    expect(() => progressPayloadSchema.parse({ label: "x", percent: 150 })).toThrow();
  });

  it("link requires a valid url", () => {
    expect(() => linkPayloadSchema.parse({ url: "not a url" })).toThrow();
  });

  it("exposes a default channel constant", () => {
    expect(DEFAULT_CHANNEL).toBe("default");
  });
});
