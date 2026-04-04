import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditEventForm } from "./EditEventForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const updateEvent = vi.fn();
vi.mock("@/app/actions/events", () => ({
  updateEvent: (...args: unknown[]) => updateEvent(...args),
}));

describe("EditEventForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    updateEvent.mockReset();
  });

  const initial = {
    title: "Old",
    description: "Desc",
    location: "Here",
    startAt: "2026-03-01T15:00:00.000Z",
    endAt: "2026-03-01T17:00:00.000Z",
  };

  it("prefills fields from initial", () => {
    render(<EditEventForm eventId="e1" initial={initial} />);
    expect(screen.getByDisplayValue("Old")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Desc")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Here")).toBeInTheDocument();
  });

  it("calls updateEvent and refresh on success", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    updateEvent.mockResolvedValue({ ok: true as const });
    render(<EditEventForm eventId="e1" initial={initial} onSaved={onSaved} />);
    await user.clear(screen.getByLabelText(/Title/i));
    await user.type(screen.getByLabelText(/Title/i), "New title");
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await vi.waitFor(() => {
      expect(updateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "e1",
          title: "New title",
        }),
      );
      expect(refresh).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("invokes onCancel when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <EditEventForm eventId="e1" initial={initial} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not render cancel without onCancel", () => {
    render(<EditEventForm eventId="e1" initial={initial} />);
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });
});
