import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hour12PeriodToHour24,
  hour24ToHour12AndPeriod,
  isoToDatetimeLocal,
  joinDatetimeLocal,
  normalizeStartEndPair,
  shouldSyncEndToStart,
  snapDatetimeLocalToFiveMinutes,
  splitDatetimeLocal,
  splitTimeToHourMinuteFive,
} from "./datetime-local";

describe("datetime-local", () => {
  describe("with TZ=UTC", () => {
    const prevTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = "UTC";
    });
    afterAll(() => {
      process.env.TZ = prevTz;
    });

    it("isoToDatetimeLocal formats valid ISO in local (UTC) components", () => {
      expect(isoToDatetimeLocal("2026-03-01T15:30:00.000Z")).toBe(
        "2026-03-01T15:30",
      );
    });

    it("isoToDatetimeLocal returns empty for nullish or invalid", () => {
      expect(isoToDatetimeLocal(null)).toBe("");
      expect(isoToDatetimeLocal(undefined)).toBe("");
      expect(isoToDatetimeLocal("not-a-date")).toBe("");
    });
  });

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

  it("splitTimeToHourMinuteFive snaps to five minutes", () => {
    expect(splitTimeToHourMinuteFive("14:07")).toEqual({
      hour: "14",
      minute: "05",
    });
    expect(splitTimeToHourMinuteFive("bad")).toEqual({
      hour: "00",
      minute: "00",
    });
  });

  it("hour24ToHour12AndPeriod converts 24h to 12h + period", () => {
    expect(hour24ToHour12AndPeriod("00")).toEqual({
      hour12: "12",
      period: "AM",
    });
    expect(hour24ToHour12AndPeriod("09")).toEqual({
      hour12: "9",
      period: "AM",
    });
    expect(hour24ToHour12AndPeriod("12")).toEqual({
      hour12: "12",
      period: "PM",
    });
    expect(hour24ToHour12AndPeriod("15")).toEqual({
      hour12: "3",
      period: "PM",
    });
    expect(hour24ToHour12AndPeriod("xx")).toEqual({
      hour12: "12",
      period: "AM",
    });
  });

  it("hour12PeriodToHour24 converts to two-digit 24h", () => {
    expect(hour12PeriodToHour24("12", "AM")).toBe("00");
    expect(hour12PeriodToHour24("9", "AM")).toBe("09");
    expect(hour12PeriodToHour24("12", "PM")).toBe("12");
    expect(hour12PeriodToHour24("3", "PM")).toBe("15");
    expect(hour12PeriodToHour24("0", "AM")).toBe("00");
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
