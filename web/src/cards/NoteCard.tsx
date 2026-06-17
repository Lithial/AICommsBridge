import { renderMarkdown } from "../markdown";
import type { NotePayload } from "../types";

export function NoteCard({ payload }: { payload: NotePayload }) {
  return (
    <div class={`card note note-${payload.level}`}>
      {payload.title && <div class="card-title">{payload.title}</div>}
      <div class="note-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(payload.markdown) }} />
    </div>
  );
}
