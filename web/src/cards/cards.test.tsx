import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { EventCard } from "./EventCard";
import type { FeedEvent } from "../types";
import { AskCard } from "./AskCard";
import type { AskPayload } from "../types";

const base = { id: 1, channelId: "default", key: null, createdAt: 0, updatedAt: 0 };

describe("EventCard", () => {
  it("renders a note as sanitized markdown", () => {
    const e: FeedEvent = { ...base, type: "note", payload: { markdown: "**hi**", level: "important" } };
    const { container } = render(<EventCard event={e} onRespond={vi.fn()} />);
    expect(container.querySelector("strong")?.textContent).toBe("hi");
    expect(container.querySelector(".note-important")).toBeTruthy();
  });

  it("renders a progress bar with the right width", () => {
    const e: FeedEvent = { ...base, type: "progress", payload: { label: "Build", percent: 42, status: "active" } };
    const { container } = render(<EventCard event={e} onRespond={vi.fn()} />);
    expect((container.querySelector(".progress-fill") as HTMLElement).style.width).toBe("42%");
  });

  it("renders an image pointing at /media", () => {
    const e: FeedEvent = { ...base, type: "image", payload: { mediaId: "abc.png", mime: "image/png", caption: "shot" } };
    render(<EventCard event={e} onRespond={vi.fn()} />);
    expect((screen.getByAltText("shot") as HTMLImageElement).getAttribute("src")).toBe("/media/abc.png");
  });

  it("renders a link card", () => {
    const e: FeedEvent = { ...base, type: "link", payload: { url: "https://example.com", title: "Preview" } };
    render(<EventCard event={e} onRespond={vi.fn()} />);
    expect((screen.getByText("Preview").closest("a") as HTMLAnchorElement).href).toContain("example.com");
  });

  it("renders a log with truncation note", () => {
    const e: FeedEvent = { ...base, type: "log", payload: { title: "run", lines: ["a", "b"], truncatedCount: 5 } };
    const { container } = render(<EventCard event={e} onRespond={vi.fn()} />);
    expect(container.querySelector(".log-body")?.textContent).toContain("a\nb");
    expect(container.querySelector(".log-trunc")?.textContent).toContain("5");
  });
});

const askBase: AskPayload = {
  question: "Continue?", options: null, placeholder: null,
  requestId: "req-1", answer: null, answeredAt: null,
};

describe("AskCard", () => {
  it("renders Approve/Reject when no options or placeholder", () => {
    render(<AskCard payload={askBase} onRespond={vi.fn()} />);
    expect(screen.getByText("Continue?")).toBeDefined();
    expect(screen.getByText("Approve")).toBeDefined();
    expect(screen.getByText("Reject")).toBeDefined();
  });

  it("renders multiple-choice buttons when options are provided", () => {
    render(<AskCard payload={{ ...askBase, options: ["yes", "no"] }} onRespond={vi.fn()} />);
    expect(screen.getByText("yes")).toBeDefined();
    expect(screen.getByText("no")).toBeDefined();
  });

  it("renders a textarea when placeholder is set and options is null", () => {
    render(<AskCard payload={{ ...askBase, placeholder: "Type here…" }} onRespond={vi.fn()} />);
    expect(screen.getByPlaceholderText("Type here…")).toBeDefined();
    expect(screen.getByText("Submit")).toBeDefined();
  });

  it("calls onRespond with requestId and answer when option clicked", async () => {
    const onRespond = vi.fn(async () => {});
    render(<AskCard payload={{ ...askBase, options: ["yes", "no"] }} onRespond={onRespond} />);
    fireEvent.click(screen.getByText("yes"));
    expect(onRespond).toHaveBeenCalledWith("req-1", "yes");
  });

  it("renders answered state with no interactive controls", () => {
    render(<AskCard payload={{ ...askBase, answer: "yes", answeredAt: 1000000 }} onRespond={vi.fn()} />);
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
    expect(screen.getByText("yes")).toBeDefined();
  });
});
