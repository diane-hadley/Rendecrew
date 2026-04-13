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

const assistEventGeneralInformation = vi.fn();
vi.mock("@/app/actions/event-general-information-ai", () => ({
  assistEventGeneralInformation: (...args: unknown[]) =>
    assistEventGeneralInformation(...args),
}));

describe("EditEventForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    updateEvent.mockReset();
    assistEventGeneralInformation.mockReset();
  });

  const initial = {
    title: "Old",
    generalInformation: "Desc",
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

  it("shows error when updateEvent fails", async () => {
    const user = userEvent.setup();
    updateEvent.mockResolvedValue({
      ok: false as const,
      error: "Could not save",
    });
    render(<EditEventForm eventId="e1" initial={initial} />);
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("applies AI markdown into general information field", async () => {
    const user = userEvent.setup();
    assistEventGeneralInformation.mockResolvedValue({
      ok: true as const,
      markdown: "## From AI",
    });
    render(<EditEventForm eventId="e1" initial={initial} />);
    const gi = screen.getByLabelText(/General information/i);
    expect(gi).toHaveValue("Desc");
    await user.type(
      screen.getByPlaceholderText(/day-by-day itinerary/i),
      "Expand intro",
    );
    await user.click(
      screen.getByRole("button", { name: /Generate into draft/i }),
    );
    await vi.waitFor(() => {
      expect(assistEventGeneralInformation).toHaveBeenCalled();
    });
    expect(gi).toHaveValue("## From AI");
  });
});
