import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventDetailClient } from "./EventDetailClient";

vi.mock("@/components/packing/EventPackingSection", () => ({
  EventPackingSection: () => <div data-testid="packing-section" />,
}));

vi.mock("./EventChat", () => ({
  EventChat: () => <div data-testid="event-chat" />,
}));

vi.mock("./DeleteEventPanel", () => ({
  DeleteEventPanel: () => <div data-testid="delete-panel" />,
}));

vi.mock("./EditEventForm", () => ({
  EditEventForm: ({
    onCancel,
    onSaved,
  }: {
    onCancel?: () => void;
    onSaved?: () => void;
  }) => (
    <div data-testid="edit-form">
      <button type="button" onClick={onCancel}>
        Cancel edit
      </button>
      <button type="button" onClick={onSaved}>
        Saved stub
      </button>
    </div>
  ),
}));

const baseProps = {
  eventId: "e1",
  role: "organizer",
  display: {
    title: "Summit",
    description: null,
    location: null,
    dateRangeLabel: "Apr 2026",
  },
  editInitial: {
    title: "Summit",
    description: null,
    location: null,
    startAt: null,
    endAt: null,
  },
  packing: {
    canManagePacking: false,
    liveblocksRoomId: null,
    commitments: [],
    packingListPath: null,
  },
};

describe("EventDetailClient", () => {
  it("shows display card when not editing", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByRole("heading", { name: "Summit" })).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-panel")).not.toBeInTheDocument();
  });

  it("does not show settings when not editable", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(
      screen.queryByRole("button", { name: "Event settings" }),
    ).not.toBeInTheDocument();
  });

  it("opens edit form and delete panel when settings clicked", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Event settings" }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    expect(screen.getByTestId("delete-panel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summit" })).not.toBeInTheDocument();
  });

  it("closes edit mode when cancel runs", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Event settings" }));
    await user.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(screen.getByRole("heading", { name: "Summit" })).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });

  it("always renders packing and chat sections", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByTestId("packing-section")).toBeInTheDocument();
    expect(screen.getByTestId("event-chat")).toBeInTheDocument();
  });
});
