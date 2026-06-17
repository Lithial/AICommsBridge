import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { EventCard } from "./EventCard";
import type { FeedEvent } from "../types";

const base = { id: 1, channelId: "default", key: null, createdAt: 0, updatedAt: 0 };

describe("EventCard", () => {
  it("renders a note as sanitized markdown", () => {
    const e: FeedEvent = { ...base, type: "note", payload: { markdown: "**hi**", level: "important" } };
    const { container } = render(<EventCard event={e} />);
    expect(container.querySelector("strong")?.textContent).toBe("hi");
    expect(container.querySelector(".note-important")).toBeTruthy();
  });

  it("renders a progress bar with the right width", () => {
    const e: FeedEvent = { ...base, type: "progress", payload: { label: "Build", percent: 42, status: "active" } };
    const { container } = render(<EventCard event={e} />);
    expect((container.querySelector(".progress-fill") as HTMLElement).style.width).toBe("42%");
  });

  it("renders an image pointing at /media", () => {
    const e: FeedEvent = { ...base, type: "image", payload: { mediaId: "abc.png", mime: "image/png", caption: "shot" } };
    render(<EventCard event={e} />);
    expect((screen.getByAltText("shot") as HTMLImageElement).getAttribute("src")).toBe("/media/abc.png");
  });

  it("renders a link card", () => {
    const e: FeedEvent = { ...base, type: "link", payload: { url: "https://example.com", title: "Preview" } };
    render(<EventCard event={e} />);
    expect((screen.getByText("Preview").closest("a") as HTMLAnchorElement).href).toContain("example.com");
  });

  it("renders a log with truncation note", () => {
    const e: FeedEvent = { ...base, type: "log", payload: { title: "run", lines: ["a", "b"], truncatedCount: 5 } };
    const { container } = render(<EventCard event={e} />);
    expect(container.querySelector(".log-body")?.textContent).toContain("a\nb");
    expect(container.querySelector(".log-trunc")?.textContent).toContain("5");
  });
});
