import { describe, it, expect } from "vitest";

describe("web toolchain", () => {
  it("runs in a jsdom environment", () => {
    expect(typeof document).toBe("object");
    const el = document.createElement("div");
    expect(el.tagName).toBe("DIV");
  });
});
