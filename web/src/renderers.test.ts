import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import { highlightCode } from "./highlight";
import { renderDiff } from "./diff-view";

describe("renderMarkdown", () => {
  it("renders markdown and strips scripts", () => {
    const html = renderMarkdown("**bold** <script>alert(1)</script>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script>");
  });
});

describe("highlightCode", () => {
  it("returns highlighted html containing the source text", () => {
    const html = highlightCode("const x = 1;", "javascript");
    expect(html).toContain("x");
  });
  it("falls back without throwing for an unknown language", () => {
    expect(() => highlightCode("<a>", "not-a-lang")).not.toThrow();
    expect(highlightCode("<a>", "not-a-lang")).toContain("&lt;a&gt;");
  });
});

describe("renderDiff", () => {
  it("classes added/removed/hunk lines and escapes html", () => {
    const html = renderDiff("@@ -1 +1 @@\n-<old>\n+<new>");
    expect(html).toContain('class="diff-line hunk"');
    expect(html).toContain('class="diff-line del"');
    expect(html).toContain('class="diff-line add"');
    expect(html).toContain("&lt;new&gt;");
  });
});
