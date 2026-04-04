import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DescribeEventForm } from "./DescribeEventForm";

const createEventFromNaturalLanguage = vi.fn();
vi.mock("@/app/actions/events", () => ({
  createEventFromNaturalLanguage: (...args: unknown[]) =>
    createEventFromNaturalLanguage(...args),
}));

describe("DescribeEventForm", () => {
  beforeEach(() => {
    createEventFromNaturalLanguage.mockReset();
  });

  it("submits description to action", async () => {
    const user = userEvent.setup();
    createEventFromNaturalLanguage.mockResolvedValue({ ok: true as const });
    render(<DescribeEventForm />);
    await user.type(
      screen.getByLabelText(/What's the event/i),
      "Team lunch tomorrow noon",
    );
    await user.click(screen.getByRole("button", { name: /Create from description/i }));
    await vi.waitFor(() => {
      expect(createEventFromNaturalLanguage).toHaveBeenCalledWith(
        "Team lunch tomorrow noon",
      );
    });
  });

  it("shows error when action fails", async () => {
    const user = userEvent.setup();
    createEventFromNaturalLanguage.mockResolvedValue({
      ok: false as const,
      error: "Bad input",
    });
    render(<DescribeEventForm />);
    await user.type(screen.getByLabelText(/What's the event/i), "x");
    await user.click(screen.getByRole("button", { name: /Create from description/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bad input");
  });
});
