import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventPackingSection } from "./EventPackingSection";

vi.mock("./PackingListEventPanel", () => ({
  PackingListEventPanel: ({ eventId }: { eventId: string }) => (
    <div data-testid="packing-panel">panel-{eventId}</div>
  ),
}));

vi.mock("./MyEventPackingCommitments", () => ({
  MyEventPackingCommitments: () => <div data-testid="commitments" />,
}));

describe("EventPackingSection", () => {
  it("returns null when there is no list and user cannot manage", () => {
    const { container } = render(
      <EventPackingSection
        eventId="e1"
        canManagePacking={false}
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders organizer panel when canManagePacking", () => {
    render(
      <EventPackingSection
        eventId="e99"
        canManagePacking
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Packing list" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("packing-panel")).toHaveTextContent("panel-e99");
    expect(screen.queryByTestId("commitments")).not.toBeInTheDocument();
  });

  it("renders commitments when list path exists", () => {
    render(
      <EventPackingSection
        eventId="e1"
        canManagePacking={false}
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath="/packing/room"
      />,
    );
    expect(screen.getByTestId("commitments")).toBeInTheDocument();
    expect(screen.queryByTestId("packing-panel")).not.toBeInTheDocument();
  });
});
