import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteEventPanel } from "./DeleteEventPanel";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const deleteEvent = vi.fn();
vi.mock("@/app/actions/events", () => ({
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
}));

describe("DeleteEventPanel", () => {
  beforeEach(() => {
    push.mockClear();
    deleteEvent.mockReset();
  });

  it("reveals confirmation after Delete event", async () => {
    const user = userEvent.setup();
    render(<DeleteEventPanel eventId="e1" eventTitle="Picnic" />);
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(
      screen.getByRole("region", { name: "Confirm delete event" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Delete "Picnic"/)).toBeInTheDocument();
  });

  it("calls deleteEvent and navigates on success", async () => {
    const user = userEvent.setup();
    deleteEvent.mockResolvedValue({ ok: true as const });
    render(<DeleteEventPanel eventId="e1" eventTitle="T" />);
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    await vi.waitFor(() => {
      expect(deleteEvent).toHaveBeenCalledWith("e1");
      expect(push).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error when delete fails", async () => {
    const user = userEvent.setup();
    deleteEvent.mockResolvedValue({ ok: false as const, error: "Nope" });
    render(<DeleteEventPanel eventId="e1" eventTitle="T" />);
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
  });

  it("closes confirmation on Cancel", async () => {
    const user = userEvent.setup();
    render(<DeleteEventPanel eventId="e1" eventTitle="T" />);
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("region", { name: "Confirm delete event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete event" }),
    ).toBeInTheDocument();
  });
});
