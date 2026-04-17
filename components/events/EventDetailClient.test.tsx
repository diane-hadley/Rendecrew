import {
  EventMemberRole,
  MemberManagementPolicy,
  PackingListVisibility,
} from "@prisma/client";
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

vi.mock("./EventMembersSection", () => ({
  EventMembersSection: () => <div data-testid="members-section" />,
}));

vi.mock("./EventSettingsForm", () => ({
  EventSettingsForm: () => <div data-testid="settings-form" />,
}));

vi.mock("./rides/EventRidesBoard", () => ({
  EventRidesBoard: () => <div data-testid="rides-board" />,
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
  createdById: "u1",
  currentUserId: "u1",
  actorRole: EventMemberRole.creator,
  isCreator: true,
  display: {
    title: "Summit",
    generalInformation: null,
    location: null,
    dateRangeLabel: "Apr 2026",
  },
  editInitial: {
    title: "Summit",
    generalInformation: null,
    location: null,
    startAt: null,
    endAt: null,
    timezone: "UTC",
  },
  packing: {
    canManagePacking: false,
    liveblocksRoomId: null,
    commitments: [],
    packingListPath: null,
    suggestionApprovalRequired: false,
    pendingSuggestionDraftCount: 0,
  },
  settings: {
    memberManagementPolicy: MemberManagementPolicy.ANY_MEMBER_CAN_INVITE,
    packingListVisibility: PackingListVisibility.URL_PUBLIC,
    suggestionApprovalRequired: false,
    ridesEnabled: false,
  },
  ridesDefaultTimeZone: "UTC",
  membersInitial: [],
};

describe("EventDetailClient", () => {
  it("shows display card when not editing", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });

  it("does not show edit when not editable", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(
      screen.queryByRole("button", { name: "Edit event information" }),
    ).not.toBeInTheDocument();
  });

  it("opens edit form when edit is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(
      screen.getByRole("button", { name: "Edit event information" }),
    );
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    expect(screen.queryByText("Apr 2026")).not.toBeInTheDocument();
  });

  it("closes edit mode when cancel runs", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(
      screen.getByRole("button", { name: "Edit event information" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });

  it("always renders packing and chat on overview", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByTestId("packing-section")).toBeInTheDocument();
    expect(screen.getByTestId("event-chat")).toBeInTheDocument();
  });

  it("shows members tab content", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable={false} />);
    await user.click(screen.getByRole("button", { name: "Members" }));
    expect(screen.getByTestId("members-section")).toBeInTheDocument();
  });

  it("shows settings tab content", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("settings-form")).toBeInTheDocument();
  });

  it("shows rides tab when rides are enabled", async () => {
    const user = userEvent.setup();
    render(
      <EventDetailClient
        {...baseProps}
        editable={false}
        settings={{
          ...baseProps.settings,
          ridesEnabled: true,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Rides" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rides" }));
    expect(screen.getByTestId("rides-board")).toBeInTheDocument();
  });

  it("hides rides tab when rides are disabled", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(
      screen.queryByRole("button", { name: "Rides" }),
    ).not.toBeInTheDocument();
  });

  it("returns to overview when rides are turned off while on rides tab", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EventDetailClient
        {...baseProps}
        editable={false}
        settings={{
          ...baseProps.settings,
          ridesEnabled: true,
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Rides" }));
    expect(screen.getByTestId("rides-board")).toBeInTheDocument();

    rerender(
      <EventDetailClient
        {...baseProps}
        editable={false}
        settings={{
          ...baseProps.settings,
          ridesEnabled: false,
        }}
      />,
    );

    expect(screen.queryByTestId("rides-board")).not.toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
  });
});
