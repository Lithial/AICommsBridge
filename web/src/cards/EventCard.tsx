import type { FeedEvent, ImagePayload, NotePayload, ProgressPayload, CodePayload, LinkPayload, LogPayload } from "../types";
import { ImageCard } from "./ImageCard";
import { NoteCard } from "./NoteCard";
import { ProgressCard } from "./ProgressCard";
import { CodeCard } from "./CodeCard";
import { LinkCard } from "./LinkCard";
import { LogCard } from "./LogCard";

export function EventCard({ event }: { event: FeedEvent }) {
  switch (event.type) {
    case "image": return <ImageCard payload={event.payload as ImagePayload} />;
    case "note": return <NoteCard payload={event.payload as NotePayload} />;
    case "progress": return <ProgressCard payload={event.payload as ProgressPayload} />;
    case "code": return <CodeCard payload={event.payload as CodePayload} />;
    case "link": return <LinkCard payload={event.payload as LinkPayload} />;
    case "log": return <LogCard payload={event.payload as LogPayload} />;
    default: return null;
  }
}
