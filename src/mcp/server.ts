import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeedService } from "../feed.js";
import { DEFAULT_CHANNEL } from "../domain/events.js";

export function createMcpServer(feed: FeedService): McpServer {
  const server = new McpServer({ name: "aicommsbridge", version: "0.1.0" });
  const channel = z.string().min(1).optional();
  const ack = (id: number, ch: string) => ({ content: [{ type: "text" as const, text: `Posted event #${id} to channel "${ch}".` }] });
  const ch = (c?: string) => c ?? DEFAULT_CHANNEL;

  server.registerTool("show_image", {
    title: "Show image / screenshot",
    description: "Display an image in the feed. Provide a local file 'path' OR base64 'data' (with 'mimeType').",
    inputSchema: { path: z.string().optional(), data: z.string().optional(), mimeType: z.string().optional(), caption: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showImage({ channelId: ch(a.channel), path: a.path, data: a.data, mimeType: a.mimeType, caption: a.caption });
    return ack(e.id, e.channelId);
  });

  server.registerTool("post_note", {
    title: "Post a note",
    description: "Post a markdown note. Use level 'important'|'warn'|'error' to make it stand out and notify.",
    inputSchema: { markdown: z.string(), level: z.enum(["info", "important", "success", "warn", "error"]).optional(), title: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.postNote({ channelId: ch(a.channel), markdown: a.markdown, level: a.level, title: a.title });
    return ack(e.id, e.channelId);
  });

  server.registerTool("update_progress", {
    title: "Update progress",
    description: "Create or update a progress card identified by 'key'. Re-call with the same key to update it in place.",
    inputSchema: { key: z.string(), label: z.string(), percent: z.number().min(0).max(100).optional(), status: z.enum(["active", "done", "error"]).optional(), channel },
  }, async (a) => {
    const e = feed.updateProgress({ channelId: ch(a.channel), key: a.key, label: a.label, percent: a.percent, status: a.status });
    return ack(e.id, e.channelId);
  });

  server.registerTool("show_code", {
    title: "Show code",
    description: "Display a syntax-highlighted code snippet.",
    inputSchema: { code: z.string(), language: z.string().optional(), filename: z.string().optional(), caption: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showCode({ channelId: ch(a.channel), code: a.code, language: a.language, filename: a.filename, caption: a.caption });
    return ack(e.id, e.channelId);
  });

  server.registerTool("show_diff", {
    title: "Show diff",
    description: "Display a diff. Provide a unified 'diff' string OR 'before' and 'after' text.",
    inputSchema: { diff: z.string().optional(), before: z.string().optional(), after: z.string().optional(), filename: z.string().optional(), language: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showDiff({ channelId: ch(a.channel), diff: a.diff, before: a.before, after: a.after, filename: a.filename, language: a.language });
    return ack(e.id, e.channelId);
  });

  server.registerTool("add_link", {
    title: "Add link",
    description: "Add a clickable link card (deploy preview, PR, localhost, etc.).",
    inputSchema: { url: z.string().url(), title: z.string().optional(), description: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.addLink({ channelId: ch(a.channel), url: a.url, title: a.title, description: a.description });
    return ack(e.id, e.channelId);
  });

  server.registerTool("append_log", {
    title: "Append to a log stream",
    description: "Append text to a named log stream identified by 'key'. Re-call with the same key to keep appending.",
    inputSchema: { key: z.string(), text: z.string(), title: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.appendLog({ channelId: ch(a.channel), key: a.key, text: a.text, title: a.title });
    return ack(e.id, e.channelId);
  });

  server.registerTool("ask_user", {
    title: "Ask the user",
    description: "Pause and ask the user a question. The tool blocks until the user answers in the feed UI, then returns their answer. Provide 'options' for multiple-choice buttons, 'placeholder' for free-text input, or neither for Approve/Reject.",
    inputSchema: {
      question: z.string().min(1),
      options: z.array(z.string().min(1)).optional(),
      placeholder: z.string().optional(),
      channel,
    },
  }, async (a) => {
    const answer = await feed.askUser({
      channelId: ch(a.channel),
      question: a.question,
      options: a.options ?? null,
      placeholder: a.placeholder ?? null,
    });
    return { content: [{ type: "text" as const, text: answer }] };
  });

  server.registerTool("clear_feed", {
    title: "Clear the feed",
    description: "Remove cards from the feed. Omit 'channel' to clear the entire bridge, or pass one to clear just that channel. Destructive — permanently deletes feed history.",
    inputSchema: { channel },
  }, async (a) => {
    // Unlike the post tools (which default to the "default" channel), an omitted
    // channel clears EVERY channel: "clear the bridge" means clear everything.
    const { deleted } = feed.clear({ channelId: a.channel });
    const scope = a.channel ? `channel "${a.channel}"` : "all channels";
    return { content: [{ type: "text" as const, text: `Cleared ${deleted} event(s) from ${scope}.` }] };
  });

  return server;
}
