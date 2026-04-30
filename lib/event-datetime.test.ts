import { describe, expect, it } from "vitest";
import {
  APP_DEFAULT_TIME_ZONE,
  formatEventDateRangeWithTimeZones,
  getTimezoneSelectChoices,
  isValidIanaTimeZone,
  normalizeTimeZone,
  parseEventDateTime,
  rezoneWallDatetimeLocal,
  utcToWallDatetimeLocal,
} from "./event-datetime";

describe("event-datetime", () => {
  it("isValidIanaTimeZone accepts IANA ids", () => {
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone("Not/AZone")).toBe(false);
  });

  it("normalizeTimeZone falls back when invalid", () => {
    expect(normalizeTimeZone("bogus", "UTC")).toBe("UTC");
    expect(normalizeTimeZone("Europe/Paris", "UTC")).toBe("Europe/Paris");
    expect(normalizeTimeZone("bogus", "")).toBe(APP_DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone("bogus", "not-a-zone")).toBe(
      APP_DEFAULT_TIME_ZONE,
    );
  });

  it("parseEventDateTime interprets wall YYYY-MM-DDTHH:mm in the given zone", () => {
    const d = parseEventDateTime("2026-06-01T12:00", "America/New_York");
    expect(d).not.toBeNull();
    const back = utcToWallDatetimeLocal(d!, "America/New_York");
    expect(back).toBe("2026-06-01T12:00");
  });

  it("utcToWallDatetimeLocal respects explicit offset in ISO strings", () => {
    const iso = "2026-06-01T12:00:00.000+05:30";
    expect(utcToWallDatetimeLocal(iso, "America/New_York")).toBe(
      "2026-06-01T02:30",
    );
  });

  it("rezoneWallDatetimeLocal preserves the instant", () => {
    const wall = "2026-06-01T12:00";
    const next = rezoneWallDatetimeLocal(
      wall,
      "America/New_York",
      "Europe/London",
    );
    const a = parseEventDateTime(wall, "America/New_York")!.getTime();
    const b = parseEventDateTime(next, "Europe/London")!.getTime();
    expect(a).toBe(b);
  });

  it("formatEventDateRangeWithTimeZones includes the IANA id", () => {
    const start = new Date("2026-06-01T16:00:00.000Z");
    const end = new Date("2026-06-01T18:00:00.000Z");
    const s = formatEventDateRangeWithTimeZones(
      start,
      end,
      "America/New_York",
      "America/New_York",
    );
    expect(s).toContain("America/New_York");
    expect(s).toMatch(/–/);
  });

  it("formatEventDateRangeWithTimeZones handles missing dates", () => {
    expect(formatEventDateRangeWithTimeZones(null, null, "UTC", "UTC")).toBe(
      "No date set",
    );
  });

  it("getTimezoneSelectChoices lists curated zones", () => {
    const groups = getTimezoneSelectChoices("UTC");
    const flat = groups.flatMap((g) => g.choices);
    expect(flat.some((c) => c.id === "UTC")).toBe(true);
    expect(flat.some((c) => c.id === "America/New_York")).toBe(true);
    expect(flat.length).toBeLessThan(80);
  });

  it("getTimezoneSelectChoices adds Other when current id is valid but not curated", () => {
    const id = "Atlantic/Reykjavik";
    expect(isValidIanaTimeZone(id)).toBe(true);
    const groups = getTimezoneSelectChoices(id);
    const other = groups.find((g) => g.group === "Other");
    expect(other?.choices.some((c) => c.id === id)).toBe(true);
  });
});
