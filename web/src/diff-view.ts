function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      const cls =
        line.startsWith("+++") || line.startsWith("---") ? "meta"
        : line.startsWith("@@") ? "hunk"
        : line.startsWith("+") ? "add"
        : line.startsWith("-") ? "del"
        : "ctx";
      return `<span class="diff-line ${cls}">${escapeHtml(line)}</span>`;
    })
    .join("\n");
}
