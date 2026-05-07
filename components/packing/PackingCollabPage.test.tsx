import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { markSuggestionsCatalogSeen } from "@/app/actions/packing-advanced";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackingCollabPage } from "./PackingCollabPage";

vi.mock("@/app/actions/packing-advanced", () => ({
  markSuggestionsCatalogSeen: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
    sectionId: null as string | null,
    signUps: [],
  },
];

const advancedDefaults = {
  eventId: "ev1",
  canManageTemplate: false,
  suggestionApprovalRequired: false,
  publishedSuggestions: [] as const,
  draftSuggestions: [] as const,
  personalItems: [] as const,
  commitments: [] as const,
};

describe("PackingCollabPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/");
    vi.mocked(markSuggestionsCatalogSeen).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders main flow for signed-in user without guest gate", () => {
    render(
      <PackingCollabPage
        roomId="room-1"
        eventTitle="Beach day"
        initialSections={[]}
        initialItems={sampleItems}
        authUser={{
          dbUserId: "u1",
          name: "Alex",
          email: "alex@example.com",
        }}
        {...advancedDefaults}
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
        initialSections={[]}
        initialItems={[]}
        authUser={null}
        {...advancedDefaults}
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
        initialSections={[]}
        initialItems={[]}
        authUser={null}
        {...advancedDefaults}
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

  it("selects initial tab from the tab query param", async () => {
    window.history.pushState({}, "", "?tab=my");
    render(
      <PackingCollabPage
        roomId="room-tabs"
        eventTitle="Trip"
        initialSections={[]}
        initialItems={sampleItems}
        authUser={{
          dbUserId: "u-tabs",
          name: "Alex",
          email: "alex@example.com",
        }}
        {...advancedDefaults}
        eventId="ev-tabs"
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "My packing" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  it("marks suggestions catalog seen when opening suggestions tab", async () => {
    const user = userEvent.setup();
    render(
      <PackingCollabPage
        roomId="room-sug"
        eventTitle="Fest"
        initialSections={[]}
        initialItems={sampleItems}
        authUser={{
          dbUserId: "u-sug",
          name: "Alex",
          email: "alex@example.com",
        }}
        {...advancedDefaults}
        eventId="ev-sug"
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Suggestions" }));
    await waitFor(() => {
      expect(vi.mocked(markSuggestionsCatalogSeen)).toHaveBeenCalledWith(
        "ev-sug",
      );
    });
  });

  it("shows manager template notice when allowed", () => {
    render(
      <PackingCollabPage
        roomId="room-mgr"
        eventTitle="Staff day"
        initialSections={[]}
        initialItems={sampleItems}
        authUser={{
          dbUserId: "u-mgr",
          name: "Alex",
          email: "alex@example.com",
        }}
        {...advancedDefaults}
        eventId="ev-mgr"
        canManageTemplate
      />,
    );
    expect(
      screen.getByText(/You can edit the shared template/i),
    ).toBeInTheDocument();
  });

  it("shows guest banner after guest continues", async () => {
    const user = userEvent.setup();
    render(
      <PackingCollabPage
        roomId="room-guest-banner"
        eventTitle="Meetup"
        initialSections={[]}
        initialItems={[]}
        authUser={null}
        {...advancedDefaults}
      />,
    );
    await user.type(screen.getByPlaceholderText("Your name"), "Sam");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(
        screen.getByText(/Guest — you can sign up for items/i),
      ).toBeInTheDocument();
    });
  });
});
