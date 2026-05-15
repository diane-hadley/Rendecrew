import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimeZonePickerModal } from "./TimeZonePickerModal";

describe("TimeZonePickerModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TimeZonePickerModal
        open={false}
        title="Pick zone"
        startLabel="Start"
        endLabel="End"
        startTimeZone="UTC"
        endTimeZone="UTC"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onApply with normalized zones", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <TimeZonePickerModal
        open
        title="Pick zone"
        startLabel="Start"
        endLabel="End"
        startTimeZone="America/Los_Angeles"
        endTimeZone="America/Los_Angeles"
        onClose={onClose}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^OK$/i }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        startTimeZone: "America/Los_Angeles",
        endTimeZone: "America/Los_Angeles",
        useSeparateEndTimeZone: false,
      }),
    );
  });
});
