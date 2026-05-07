import { PackingListVisibility } from "@prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PackingSection } from "./PackingSection";

vi.mock("./PackingListPanel", () => ({
  PackingListPanel: ({ eventId }: { eventId: string }) => (
    <div data-testid="packing-panel">panel-{eventId}</div>
  ),
}));

vi.mock("./MyPackingCommitments", () => ({
  MyPackingCommitments: () => <div data-testid="commitments" />,
}));

describe("PackingSection", () => {
  it("returns null when there is no list and user cannot manage", () => {
    const { container } = render(
      <PackingSection
        eventId="e1"
        canManagePacking={false}
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath={null}
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
        collab={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders admin panel when canManagePacking", () => {
    render(
      <PackingSection
        eventId="e99"
        canManagePacking
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath={null}
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
        collab={null}
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
      <PackingSection
        eventId="e1"
        canManagePacking={false}
        liveblocksRoomId={null}
        commitments={[]}
        packingListPath="/packing/room"
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
        collab={null}
      />,
    );
    expect(screen.getByTestId("commitments")).toBeInTheDocument();
    expect(screen.queryByTestId("packing-panel")).not.toBeInTheDocument();
  });
});
