import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { Feed } from "./feed";
import type { FeedEvent } from "./types";

const note = (id: number, text: string): FeedEvent => ({ id, channelId: "default", type: "note", key: null, createdAt: id, updatedAt: id, payload: { markdown: text, level: "info" } });

const baseProps = {
  channels: [] as string[],
  selectedChannel: null,
  onSelectChannel: vi.fn(),
  onRespond: vi.fn(async () => {}),
};

describe("Feed", () => {
  it("renders one card per event and shows connection status", () => {
    render(<Feed events={[note(1, "alpha"), note(2, "beta")]} connected={true} {...baseProps} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
  });

  it("shows reconnecting when disconnected", () => {
    render(<Feed events={[]} connected={false} {...baseProps} />);
    expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  });

  it("invokes onClear when the Clear button is clicked", () => {
    const onClear = vi.fn();
    render(<Feed events={[note(1, "alpha")]} connected={true} onClear={onClear} {...baseProps} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("disables the Clear button when the feed is empty", () => {
    render(<Feed events={[]} connected={true} onClear={() => {}} {...baseProps} />);
    expect((screen.getByText("Clear") as HTMLButtonElement).disabled).toBe(true);
  });
});
