import { describe, it, expect, vi, afterEach } from "vitest";
import { maybeNotify, requestNotifyPermission } from "./notify";
import type { FeedEvent, NotePayload } from "./types";

const noteEvent = (level: NotePayload["level"]): FeedEvent => ({ id: 1, channelId: "default", type: "note", key: null, createdAt: 0, updatedAt: 0, payload: { markdown: "heads up", level } });

afterEach(() => vi.unstubAllGlobals());

function stubNotification(permission: NotificationPermission) {
  const ctor = vi.fn();
  vi.stubGlobal("Notification", Object.assign(ctor, { permission }));
  return ctor;
}

describe("maybeNotify", () => {
  it("notifies for important notes when the tab is hidden and permission granted", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("important"), { hidden: true });
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("does not notify for info-level notes", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("info"), { hidden: true });
    expect(ctor).not.toHaveBeenCalled();
  });

  it("does not notify when the tab is visible", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("error"), { hidden: false });
    expect(ctor).not.toHaveBeenCalled();
  });
});

describe("requestNotifyPermission", () => {
  it("defers the permission request to the first user gesture", () => {
    const Notif = stubNotification("default");
    const requestPermission = vi.fn();
    (Notif as unknown as { requestPermission: unknown }).requestPermission = requestPermission;
    const addEventListener = vi.fn();
    requestNotifyPermission({ addEventListener } as Pick<EventTarget, "addEventListener">);
    expect(addEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), { once: true });
    expect(requestPermission).not.toHaveBeenCalled();
    (addEventListener.mock.calls[0][1] as () => void)();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("does nothing once permission is already decided", () => {
    stubNotification("granted");
    const addEventListener = vi.fn();
    requestNotifyPermission({ addEventListener } as Pick<EventTarget, "addEventListener">);
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
