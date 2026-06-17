import type { CodePayload } from "../types";
import { highlightCode } from "../highlight";
import { renderDiff } from "../diff-view";

export function CodeCard({ payload }: { payload: CodePayload }) {
  if (payload.mode === "diff") {
    return (
      <div class="card code diff">
        {payload.filename && <div class="card-title">{payload.filename}</div>}
        <pre class="diff-block" dangerouslySetInnerHTML={{ __html: renderDiff(payload.diff ?? "") }} />
      </div>
    );
  }
  return (
    <div class="card code">
      {payload.filename && <div class="card-title">{payload.filename}</div>}
      <pre class="code-block"><code dangerouslySetInnerHTML={{ __html: highlightCode(payload.code ?? "", payload.language) }} /></pre>
      {payload.caption && <div class="card-caption">{payload.caption}</div>}
    </div>
  );
}
