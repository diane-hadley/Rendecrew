import {
  EventMemberRole,
  MemberManagementPolicy,
  PackingListVisibility,
} from "@prisma/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventDetailClient } from "./EventDetailClient";

vi.mock("@/components/packing/PackingSection", () => ({
  PackingSection: () => <div data-testid="packing-section" />,
}));

vi.mock("./Chat", () => ({
  Chat: () => <div data-testid="event-chat" />,
}));

vi.mock("./MembersSection", () => ({
  MembersSection: () => <div data-testid="members-section" />,
}));

vi.mock("./EventSettingsForm", () => ({
  EventSettingsForm: () => <div data-testid="settings-form" />,
}));

vi.mock("@/components/rides/RidesBoard", () => ({
  RidesBoard: () => <div data-testid="rides-board" />,
}));

vi.mock("@/components/tasks/TaskBoard", () => ({
  TaskBoard: () => <div data-testid="task-board" />,
}));

vi.mock("./EditEventDetailsForm", () => ({
  EditEventDetailsForm: ({
    onCancel,
    onSaved,
  }: {
    onCancel?: () => void;
    onSaved?: () => void;
  }) => (
    <div data-testid="edit-details-form">
      <button type="button" onClick={onCancel}>
        Cancel edit
      </button>
      <button type="button" onClick={onSaved}>
        Saved stub
      </button>
    </div>
  ),
}));

vi.mock("./EditGeneralInformationForm", () => ({
  EditGeneralInformationForm: ({
    onCancel,
    onSaved,
  }: {
    onCancel?: () => void;
    onSaved?: () => void;
  }) => (
    <div data-testid="edit-gi-form">
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
    packingEnabled: true,
    suggestionApprovalRequired: false,
    ridesEnabled: false,
    taskBoardEnabled: false,
  },
  ridesDefaultTimeZone: "UTC",
  membersInitial: [],
};

describe("EventDetailClient", () => {
  it("shows display card when not editing", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-gi-form")).not.toBeInTheDocument();
  });

  it("does not show edit when not editable", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(
      screen.queryByRole("button", { name: "Edit general info" }),
    ).not.toBeInTheDocument();
  });

  it("opens edit form when edit is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Edit general info" }));
    expect(screen.getByTestId("edit-gi-form")).toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
  });

  it("opens full event edit when Edit event is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Edit event" }));
    expect(screen.getByTestId("edit-details-form")).toBeInTheDocument();
  });

  it("closes edit mode when cancel runs", async () => {
    const user = userEvent.setup();
    render(<EventDetailClient {...baseProps} editable />);
    await user.click(screen.getByRole("button", { name: "Edit general info" }));
    await user.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(screen.getByText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-details-form")).not.toBeInTheDocument();
  });

  it("renders chat on overview", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(screen.getByTestId("event-chat")).toBeInTheDocument();
  });

  it("shows packing list in its own tab when available", async () => {
    const user = userEvent.setup();
    render(
      <EventDetailClient
        {...baseProps}
        editable={false}
        packing={{ ...baseProps.packing, canManagePacking: true }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Packing list" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("packing-section")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Packing list" }));
    expect(screen.getByTestId("packing-section")).toBeInTheDocument();
  });

  it("hides packing list tab when packing is disabled", () => {
    render(
      <EventDetailClient
        {...baseProps}
        editable={false}
        packing={{ ...baseProps.packing, canManagePacking: true }}
        settings={{ ...baseProps.settings, packingEnabled: false }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Packing list" }),
    ).not.toBeInTheDocument();
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

  it("shows tasks tab when task board is enabled", async () => {
    const user = userEvent.setup();
    render(
      <EventDetailClient
        {...baseProps}
        editable={false}
        settings={{ ...baseProps.settings, taskBoardEnabled: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByTestId("task-board")).toBeInTheDocument();
  });

  it("hides tasks tab when task board is disabled", () => {
    render(<EventDetailClient {...baseProps} editable={false} />);
    expect(
      screen.queryByRole("button", { name: "Tasks" }),
    ).not.toBeInTheDocument();
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
