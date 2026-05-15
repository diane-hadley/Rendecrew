import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEventWallDatetimeFields } from "./use-event-wall-datetime-fields";

describe("useEventWallDatetimeFields", () => {
  it("empty mode exposes wall payload with shared timezone", () => {
    const { result } = renderHook(() =>
      useEventWallDatetimeFields({
        mode: "empty",
        defaultTimeZone: "UTC",
      }),
    );
    expect(result.current.wallDatetimePayload).toEqual({
      startAt: "",
      endAt: "",
      startAtTimeZone: "UTC",
      endAtTimeZone: "UTC",
    });
  });

  it("from-event mode syncs end when start moves past end", () => {
    const { result } = renderHook(() =>
      useEventWallDatetimeFields({
        mode: "from-event",
        initial: {
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T12:00:00.000Z",
          startAtTimeZone: "UTC",
          endAtTimeZone: "UTC",
        },
      }),
    );

    act(() => {
      result.current.onStartChange("2026-06-01T14:00");
    });
    expect(result.current.endAt).toBe("2026-06-01T14:00");
  });
});
