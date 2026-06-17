import type { LinkPayload } from "../types";

export function LinkCard({ payload }: { payload: LinkPayload }) {
  return (
    <a class="card link" href={payload.url} target="_blank" rel="noreferrer noopener">
      <div class="link-title">{payload.title ?? payload.url}</div>
      {payload.description && <div class="link-desc">{payload.description}</div>}
      <div class="link-url">{payload.url}</div>
    </a>
  );
}
