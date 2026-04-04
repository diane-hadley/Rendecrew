import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateEventForm } from "./CreateEventForm";

const createEvent = vi.fn();
vi.mock("@/app/actions/events", () => ({
  createEvent: (...args: unknown[]) => createEvent(...args),
}));

describe("CreateEventForm", () => {
  beforeEach(() => {
    createEvent.mockReset();
  });

  it("submits trimmed fields and datetime state", async () => {
    const user = userEvent.setup();
    createEvent.mockResolvedValue({ ok: true as const });
    render(<CreateEventForm />);

    await user.type(screen.getByLabelText(/Title/i), "Meetup");
    await user.type(screen.getByLabelText(/^Description$/i), "  details  ");
    await user.type(screen.getByLabelText(/^Location$/i), "  Cafe  ");

    const startDate = document.getElementById("event-start-date") as HTMLInputElement;
    await user.type(startDate, "2026-06-01");

    await user.click(screen.getByRole("button", { name: /Create event/i }));

    await vi.waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Meetup",
          description: "details",
          location: "Cafe",
        }),
      );
    });
    const payload = createEvent.mock.calls[0][0] as {
      startAt: string;
      endAt: string;
    };
    expect(payload.startAt).toMatch(/^2026-06-01T/);
  });

  it("shows validation error from action", async () => {
    const user = userEvent.setup();
    createEvent.mockResolvedValue({ ok: false as const, error: "Invalid time" });
    render(<CreateEventForm />);
    await user.type(screen.getByLabelText(/Title/i), "T");
    await user.click(screen.getByRole("button", { name: /Create event/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid time");
  });

  it("links cancel to dashboard", () => {
    render(<CreateEventForm />);
    expect(screen.getByRole("link", { name: /Cancel/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
