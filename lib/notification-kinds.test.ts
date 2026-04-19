import { describe, expect, it } from "vitest";
import {
  isNotificationKind,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "./notification-kinds";

describe("isNotificationKind", () => {
  it("returns true for every known kind", () => {
    for (const k of NOTIFICATION_KINDS) {
      expect(isNotificationKind(k)).toBe(true);
    }
  });

  it("narrows type for known keys", () => {
    const s: string = "tasks.due_date_changed";
    if (isNotificationKind(s)) {
      const _k: NotificationKind = s;
      expect(_k).toBe("tasks.due_date_changed");
    }
  });

  it("returns false for unknown strings", () => {
    expect(isNotificationKind("not.a.kind")).toBe(false);
    expect(isNotificationKind("")).toBe(false);
  });
});
