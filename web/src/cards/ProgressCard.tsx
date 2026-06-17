import type { ProgressPayload } from "../types";

export function ProgressCard({ payload }: { payload: ProgressPayload }) {
  return (
    <div class={`card progress status-${payload.status}`}>
      <div class="progress-label">{payload.label}</div>
      {payload.percent != null && (
        <div class="progress-bar"><div class="progress-fill" style={{ width: `${payload.percent}%` }} /></div>
      )}
      <div class="progress-meta">{payload.status}{payload.percent != null ? ` · ${payload.percent}%` : ""}</div>
    </div>
  );
}
