import { useRef, useEffect } from "preact/hooks";
import type { LogPayload } from "../types";

export function LogCard({ payload }: { payload: LogPayload }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [payload.lines.length]);
  return (
    <div class="card log">
      {payload.title && <div class="card-title">{payload.title}</div>}
      {payload.truncatedCount > 0 && <div class="log-trunc">… {payload.truncatedCount} earlier lines truncated</div>}
      <pre class="log-body" ref={ref}>{payload.lines.join("\n")}</pre>
    </div>
  );
}
