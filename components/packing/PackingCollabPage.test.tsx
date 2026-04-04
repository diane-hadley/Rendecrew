import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackingCollabPage } from "./PackingCollabPage";

vi.mock("@/liveblocks.config", () => ({}));

vi.mock("@liveblocks/react", () => ({
  LiveblocksProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="liveblocks-provider">{children}</div>
  ),
  RoomProvider: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id: string;
  }) => (
    <div data-testid="room-provider" data-room-id={id}>
      {children}
    </div>
  ),
  useErrorListener: () => {},
}));

vi.mock("./PackingListEditor", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./PackingListEditor")>();
  return {
    ...mod,
    PackingListEditor: () => <div data-testid="packing-editor-stub" />,
  };
});

const sampleItems = [
  {
    id: "item-1",
    name: "Plates",
    quantity: 10 as number | null,
    quantityMax: null as number | null,
    section: null as string | null,
    signUps: [],
  },
];

describe("PackingCollabPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders main flow for signed-in user without guest gate", () => {
    render(
      <PackingCollabPage
        roomId="room-1"
        eventTitle="Beach day"
        initialItems={sampleItems}
        authUser={{
          dbUserId: "u1",
          name: "Alex",
          email: "alex@example.com",
        }}
      />,
    );

    expect(
      screen.queryByText(/Join the packing list/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Packing list" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Beach day")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Signed in — sign-ups are tied to your Rendecrew account/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("packing-editor-stub")).toBeInTheDocument();
    expect(screen.getByTestId("room-provider")).toHaveAttribute(
      "data-room-id",
      "room-1",
    );
  });

  it("shows guest name form before live room", () => {
    render(
      <PackingCollabPage
        roomId="room-guest"
        eventTitle="Campout"
        initialItems={[]}
        authUser={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Join the packing list/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
    expect(screen.queryByTestId("packing-editor-stub")).not.toBeInTheDocument();
  });

  it("after guest continues, shows packing UI with stub editor", async () => {
    const user = userEvent.setup();
    render(
      <PackingCollabPage
        roomId="room-guest-2"
        eventTitle="Campout"
        initialItems={[]}
        authUser={null}
      />,
    );

    await user.type(screen.getByPlaceholderText("Your name"), "Jamie");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByTestId("packing-editor-stub")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Packing list" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Campout")).toBeInTheDocument();
  });
});
