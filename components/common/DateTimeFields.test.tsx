import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateTimeFields } from "./DateTimeFields";

describe("DateTimeFields", () => {
  it("renders label plus date/time fields", () => {
    const onChange = vi.fn();
    render(
      <DateTimeFields id="t" label="Start" value="" onChange={onChange} />,
    );
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Time")).toBeInTheDocument();
  });

  it("calls onChange with empty string when cleared", () => {
    const onChange = vi.fn();
    render(
      <DateTimeFields
        id="t"
        label="Start"
        value="2026-04-10T14:00"
        onChange={onChange}
      />,
    );
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("snaps non-grid value and syncs to parent", async () => {
    const onChange = vi.fn();
    render(
      <DateTimeFields
        id="t"
        label="Start"
        value="2026-04-10T14:07"
        onChange={onChange}
      />,
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("2026-04-10T14:00"),
    );
  });

  it("updates value when changed", () => {
    const onChange = vi.fn();
    render(
      <DateTimeFields
        id="t"
        label="Start"
        value="2026-04-10T14:00"
        onChange={onChange}
      />,
    );
    const time = screen.getByLabelText("Time");
    fireEvent.change(time, { target: { value: "14:15" } });
    expect(onChange).toHaveBeenCalledWith("2026-04-10T14:15");
  });

  it("disables date/time when disabled", () => {
    const onChange = vi.fn();
    render(
      <DateTimeFields
        id="t"
        label="End"
        value=""
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
  });
});
