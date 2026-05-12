import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInitialStorage, PackingListEditor } from "./PackingListEditor";

const editorStorage = vi.hoisted(() => ({
  items: null as unknown[] | null,
  sections: null as unknown[] | null,
}));

vi.mock("@liveblocks/react", () => ({
  useStorage: (fn: (root: { items: unknown; sections: unknown }) => unknown) =>
    fn({
      items: editorStorage.items,
      sections: editorStorage.sections,
    }),
  useSyncStatus: () => "stored" as const,
  useMutation: vi.fn(() => vi.fn()),
  useUndo: () => () => {},
  useRedo: () => () => {},
  useCanUndo: () => false,
  useCanRedo: () => false,
  useRoom: () => ({
    batch: (cb: () => void) => {
      cb();
    },
  }),
}));

const syncPackingListToDatabase = vi.fn();
vi.mock("@/app/actions/packing-list", () => ({
  syncPackingListToDatabase: (...args: unknown[]) =>
    syncPackingListToDatabase(...args),
}));

describe("buildInitialStorage", () => {
  it("wraps items and sign-ups in Live structures", () => {
    const kitchenId = "sec-kitchen";
    const storage = buildInitialStorage({
      sections: [{ id: kitchenId, title: "Kitchen" }],
      items: [
        {
          id: "i1",
          sectionId: kitchenId,
          name: "Cooler",
          quantity: 1,
          quantityMax: null,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "u1",
              packed: false,
            },
          ],
        },
      ],
    });

    expect(storage.items.length).toBe(1);
    const row = storage.items.get(0);
    expect(row?.get("name")).toBe("Cooler");
    expect(row?.get("sectionId")).toBe(kitchenId);
    const signUps = row?.get("signUps");
    expect(signUps?.length).toBe(1);
    expect(signUps?.get(0)?.get("displayName")).toBe("Pat");
  });

  it("defaults missing signUps to empty list", () => {
    const storage = buildInitialStorage({
      sections: [],
      items: [
        {
          id: "i2",
          sectionId: null,
          name: "Solo",
          quantity: null,
          quantityMax: null,
          signUps: [],
        },
      ],
    });
    expect(storage.items.get(0)?.get("signUps")?.length).toBe(0);
  });
});

describe("PackingListEditor", () => {
  beforeEach(() => {
    editorStorage.items = null;
    editorStorage.sections = null;
    syncPackingListToDatabase.mockClear();
    vi.clearAllMocks();
  });

  it("shows connecting state when storage items are not ready", () => {
    editorStorage.items = null;
    editorStorage.sections = [];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("renders table shell and add control when list is empty", () => {
    editorStorage.items = [];
    editorStorage.sections = [];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Reorder rows" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit sections" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders a row for each storage item", () => {
    editorStorage.sections = [];
    editorStorage.items = [
      {
        id: "row-1",
        name: "Lantern",
        quantity: 2,
        quantityMax: null,
        sectionId: null,
        signUps: [],
      },
    ];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );
    expect(screen.getByDisplayValue("Lantern")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign up to bring/i }),
    ).toBeInTheDocument();
  });

  it("opens a sign-up dialog from the row action", async () => {
    const user = userEvent.setup();
    editorStorage.sections = [];
    editorStorage.items = [
      {
        id: "row-modal",
        name: "Stakes",
        quantity: 3,
        quantityMax: null,
        sectionId: null,
        signUps: [],
      },
    ];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );

    await user.click(screen.getByRole("button", { name: /Sign up to bring/i }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: /Sign up to bring.*Stakes/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Confirm" }),
    ).toBeInTheDocument();
  });

  it("Needs sign-ups view hides covered items", async () => {
    const user = userEvent.setup();
    editorStorage.sections = [];
    editorStorage.items = [
      {
        id: "full",
        name: "Cooler",
        quantity: 1,
        quantityMax: null,
        sectionId: null,
        signUps: [
          {
            id: "s1",
            quantity: 1,
            displayName: "Pat",
            email: null,
            userId: "u1",
            packed: false,
          },
        ],
      },
      {
        id: "open",
        name: "Tent",
        quantity: 1,
        quantityMax: null,
        sectionId: null,
        signUps: [],
      },
    ];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );
    expect(screen.getByDisplayValue("Cooler")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tent")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Needs sign-ups", pressed: false }),
    );
    expect(screen.queryByDisplayValue("Cooler")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Tent")).toBeInTheDocument();
  });

  it("Needs sign-ups view groups same-section rows together", async () => {
    const user = userEvent.setup();
    const sk = "sec-kitchen";
    const sg = "sec-gear";
    editorStorage.sections = [
      { id: sk, title: "Kitchen" },
      { id: sg, title: "Gear" },
    ];
    editorStorage.items = [
      {
        id: "k1",
        name: "Plates",
        quantity: 1,
        quantityMax: null,
        sectionId: sk,
        signUps: [],
      },
      {
        id: "g1",
        name: "Tent",
        quantity: 1,
        quantityMax: null,
        sectionId: sg,
        signUps: [],
      },
      {
        id: "k2",
        name: "Cups",
        quantity: 1,
        quantityMax: null,
        sectionId: sk,
        signUps: [],
      },
    ];
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Needs sign-ups", pressed: false }),
    );

    const rows = screen.getAllByRole("row");
    const dataRows = rows.filter((r) =>
      r.querySelector("input[aria-label='Item name']"),
    );
    expect(
      dataRows.map((r) => r.querySelector("input[aria-label='Item name']")),
    ).toEqual([
      expect.objectContaining({ value: "Plates" }),
      expect.objectContaining({ value: "Cups" }),
      expect.objectContaining({ value: "Tent" }),
    ]);
  });

  it("schedules sync after debounce when items exist", async () => {
    vi.useFakeTimers();
    editorStorage.sections = [];
    editorStorage.items = [
      {
        id: "row-sync",
        name: "Mug",
        quantity: 1,
        quantityMax: null,
        sectionId: null,
        signUps: [],
      },
    ];
    syncPackingListToDatabase.mockResolvedValue({ ok: true as const });

    render(
      <PackingListEditor
        roomId="room-sync"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );

    await vi.advanceTimersByTimeAsync(900);

    expect(syncPackingListToDatabase).toHaveBeenCalledWith(
      "room-sync",
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: "row-sync", name: "Mug" }),
        ]),
        sections: [],
      }),
      { guestDisplayName: null },
    );
    vi.useRealTimers();
  });
});
