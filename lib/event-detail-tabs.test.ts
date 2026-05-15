import { describe, expect, it } from "vitest";
import {
  EVENT_DETAIL_TAB_IDS,
  isEventDetailTabId,
  parseEventDetailTabParam,
} from "./event-detail-tabs";

describe("event-detail-tabs", () => {
  it("lists known tab ids", () => {
    expect(EVENT_DETAIL_TAB_IDS).toContain("packing");
    expect(EVENT_DETAIL_TAB_IDS).toContain("settings");
  });

  it("isEventDetailTabId accepts valid ids", () => {
    expect(isEventDetailTabId("rides")).toBe(true);
    expect(isEventDetailTabId("nope")).toBe(false);
    expect(isEventDetailTabId(null)).toBe(false);
  });

  it("parseEventDetailTabParam returns null for missing or invalid", () => {
    expect(parseEventDetailTabParam(undefined)).toBeNull();
    expect(parseEventDetailTabParam("")).toBeNull();
    expect(parseEventDetailTabParam("  ")).toBeNull();
    expect(parseEventDetailTabParam("bogus")).toBeNull();
  });

  it("parseEventDetailTabParam trims and accepts valid tab", () => {
    expect(parseEventDetailTabParam(" tasks ")).toBe("tasks");
    expect(parseEventDetailTabParam(["packing"])).toBe("packing");
  });
});
