import { describe, expect, it } from "vitest";
import {
  joinDatetimeLocal,
  normalizeStartEndPair,
  shouldSyncEndToStart,
  snapDatetimeLocalToFiveMinutes,
  snapDatetimeLocalToMinutes,
  splitDatetimeLocal,
} from "./datetime-local";

describe("datetime-local", () => {
  it("splitDatetimeLocal splits date and HH:mm", () => {
    expect(splitDatetimeLocal("2026-04-10T14:05")).toEqual({
      date: "2026-04-10",
      time: "14:05",
    });
  });

  it("splitDatetimeLocal treats non-HH:mm time segment as empty time", () => {
    expect(splitDatetimeLocal("2026-04-10T9:30")).toEqual({
      date: "2026-04-10",
      time: "",
    });
  });

  it("splitDatetimeLocal trims and handles empty", () => {
    expect(splitDatetimeLocal("")).toEqual({ date: "", time: "" });
    expect(splitDatetimeLocal("   ")).toEqual({ date: "", time: "" });
  });

  it("joinDatetimeLocal builds value and defaults time", () => {
    expect(joinDatetimeLocal("2026-01-02", "")).toBe("2026-01-02T00:00");
    expect(joinDatetimeLocal("2026-01-02", "09:15")).toBe("2026-01-02T09:15");
    expect(joinDatetimeLocal("", "09:15")).toBe("");
  });

  it("snapDatetimeLocalToFiveMinutes rounds to 5-minute grid", () => {
    expect(snapDatetimeLocalToFiveMinutes("2026-06-01T10:07")).toBe(
      "2026-06-01T10:05",
    );
    expect(snapDatetimeLocalToFiveMinutes("")).toBe("");
  });

  it("snapDatetimeLocalToMinutes rounds to specified grid", () => {
    expect(snapDatetimeLocalToMinutes("2026-06-01T10:07", 15)).toBe(
      "2026-06-01T10:00",
    );
    expect(snapDatetimeLocalToMinutes("2026-06-01T10:08", 15)).toBe(
      "2026-06-01T10:15",
    );
    expect(snapDatetimeLocalToMinutes("", 15)).toBe("");
  });

  it("shouldSyncEndToStart when end empty or before start", () => {
    expect(shouldSyncEndToStart("2026-01-02T10:00", "")).toBe(true);
    expect(shouldSyncEndToStart("2026-01-02T10:00", "2026-01-01T10:00")).toBe(
      true,
    );
    expect(shouldSyncEndToStart("2026-01-02T10:00", "2026-01-03T10:00")).toBe(
      false,
    );
    expect(shouldSyncEndToStart("", "2026-01-02T10:00")).toBe(false);
  });

  it("normalizeStartEndPair snaps and syncs end to start when needed", () => {
    expect(
      normalizeStartEndPair("2026-01-02T10:03", "2026-01-02T10:07"),
    ).toEqual({
      start: "2026-01-02T10:05",
      end: "2026-01-02T10:05",
    });
    expect(
      normalizeStartEndPair("2026-01-02T10:00", "2026-01-02T12:00"),
    ).toEqual({
      start: "2026-01-02T10:00",
      end: "2026-01-02T12:00",
    });
  });
});
