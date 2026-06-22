import { z } from "zod";

export const DEFAULT_CHANNEL = "default";

export const EVENT_TYPES = ["image", "note", "progress", "code", "link", "log"] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = (typeof EVENT_TYPES)[number];

export const imagePayloadSchema = z.object({
  mediaId: z.string(),
  mime: z.string(),
  caption: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImagePayload = z.infer<typeof imagePayloadSchema>;

export const notePayloadSchema = z.object({
  markdown: z.string(),
  level: z.enum(["info", "important", "success", "warn", "error"]).default("info"),
  title: z.string().optional(),
});
export type NotePayload = z.infer<typeof notePayloadSchema>;

export const progressPayloadSchema = z.object({
  label: z.string(),
  percent: z.number().min(0).max(100).optional(),
  status: z.enum(["active", "done", "error"]).default("active"),
});
export type ProgressPayload = z.infer<typeof progressPayloadSchema>;

export const codePayloadSchema = z.object({
  mode: z.enum(["code", "diff"]),
  code: z.string().optional(),
  diff: z.string().optional(),
  language: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});
export type CodePayload = z.infer<typeof codePayloadSchema>;

export const linkPayloadSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
});
export type LinkPayload = z.infer<typeof linkPayloadSchema>;

export const logPayloadSchema = z.object({
  title: z.string().optional(),
  lines: z.array(z.string()),
  truncatedCount: z.number().int().nonnegative().default(0),
});
export type LogPayload = z.infer<typeof logPayloadSchema>;

export type EventPayload =
  | ImagePayload | NotePayload | ProgressPayload
  | CodePayload | LinkPayload | LogPayload;

export interface FeedEvent {
  id: number;
  channelId: string;
  type: EventType;
  key: string | null;
  createdAt: number;
  updatedAt: number;
  payload: EventPayload;
}

/**
 * Live wire messages. `created`/`updated` carry a single event; `cleared` tells
 * consumers to drop events — scoped to `channelId` when set, otherwise every channel.
 */
export type FeedMessage =
  | { kind: "created"; event: FeedEvent }
  | { kind: "updated"; event: FeedEvent }
  | { kind: "cleared"; channelId?: string };
