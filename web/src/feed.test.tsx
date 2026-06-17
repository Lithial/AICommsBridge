import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Feed } from "./feed";
import type { FeedEvent } from "./types";

const note = (id: number, text: string): FeedEvent => ({ id, channelId: "default", type: "note", key: null, createdAt: id, updatedAt: id, payload: { markdown: text, level: "info" } });

describe("Feed", () => {
  it("renders one card per event and shows connection status", () => {
    render(<Feed events={[note(1, "alpha"), note(2, "beta")]} connected={true} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
  });

  it("shows reconnecting when disconnected", () => {
    render(<Feed events={[]} connected={false} />);
    expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  });
});
