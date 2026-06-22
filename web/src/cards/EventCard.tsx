import type { FeedEvent, ImagePayload, NotePayload, ProgressPayload, CodePayload, LinkPayload, LogPayload, AskPayload } from "../types";
import { ImageCard } from "./ImageCard";
import { NoteCard } from "./NoteCard";
import { ProgressCard } from "./ProgressCard";
import { CodeCard } from "./CodeCard";
import { LinkCard } from "./LinkCard";
import { LogCard } from "./LogCard";
import { AskCard } from "./AskCard";

export function EventCard({
  event,
  onRespond,
}: {
  event: FeedEvent;
  onRespond: (requestId: string, answer: string) => Promise<void>;
}) {
  switch (event.type) {
    case "image": return <ImageCard payload={event.payload as ImagePayload} />;
    case "note": return <NoteCard payload={event.payload as NotePayload} />;
    case "progress": return <ProgressCard payload={event.payload as ProgressPayload} />;
    case "code": return <CodeCard payload={event.payload as CodePayload} />;
    case "link": return <LinkCard payload={event.payload as LinkPayload} />;
    case "log": return <LogCard payload={event.payload as LogPayload} />;
    case "ask": return <AskCard payload={event.payload as AskPayload} onRespond={onRespond} />;
    default: return null;
  }
}
