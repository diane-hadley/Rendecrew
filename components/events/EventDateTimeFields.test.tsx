import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventDateTimeFields } from "./EventDateTimeFields";

describe("EventDateTimeFields", () => {
  it("renders legend and date field", () => {
    const onChange = vi.fn();
    render(
      <EventDateTimeFields id="t" label="Start" value="" onChange={onChange} />,
    );
    expect(screen.getByRole("group", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("calls onChange with empty string when date is cleared", () => {
    const onChange = vi.fn();
    render(
      <EventDateTimeFields
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

  it("updates combined datetime when date changes", () => {
    const onChange = vi.fn();
    render(
      <EventDateTimeFields
        id="t"
        label="Start"
        value="2026-04-10T14:00"
        onChange={onChange}
      />,
    );
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-01" } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(last).toMatch(/^2026-05-01T/);
  });

  it("disables time selects when no date is set", () => {
    const onChange = vi.fn();
    render(
      <EventDateTimeFields id="t" label="End" value="" onChange={onChange} />,
    );
    expect(screen.getByLabelText("End, hour")).toBeDisabled();
    expect(screen.getByLabelText("End, minute")).toBeDisabled();
    expect(screen.getByLabelText("End, AM or PM")).toBeDisabled();
  });
});
