import type { ImagePayload } from "../types";

export function ImageCard({ payload }: { payload: ImagePayload }) {
  const src = `/media/${payload.mediaId}`;
  return (
    <div class="card image">
      <a href={src} target="_blank" rel="noreferrer noopener">
        <img src={src} alt={payload.caption ?? "screenshot"} loading="lazy" />
      </a>
      {payload.caption && <div class="card-caption">{payload.caption}</div>}
    </div>
  );
}
