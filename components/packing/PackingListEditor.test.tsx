import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInitialStorage, PackingListEditor } from "./PackingListEditor";

const editorStorage = vi.hoisted(() => ({
  items: null as unknown[] | null,
}));

vi.mock("@liveblocks/react", () => ({
  useStorage: (fn: (root: { items: unknown }) => unknown) =>
    fn({ items: editorStorage.items }),
  useSyncStatus: () => "stored" as const,
  useMutation: vi.fn(() => vi.fn()),
  useUndo: () => () => {},
  useRedo: () => () => {},
  useCanUndo: () => false,
  useCanRedo: () => false,
}));

const syncPackingListToDatabase = vi.fn();
vi.mock("@/app/actions/packing-list", () => ({
  syncPackingListToDatabase: (...args: unknown[]) =>
    syncPackingListToDatabase(...args),
}));

describe("buildInitialStorage", () => {
  it("wraps items and sign-ups in Live structures", () => {
    const storage = buildInitialStorage([
      {
        id: "i1",
        name: "Cooler",
        quantity: 1,
        quantityMax: null,
        section: "Kitchen",
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
    ]);

    expect(storage.items.length).toBe(1);
    const row = storage.items.get(0);
    expect(row?.get("name")).toBe("Cooler");
    expect(row?.get("section")).toBe("Kitchen");
    const signUps = row?.get("signUps");
    expect(signUps?.length).toBe(1);
    expect(signUps?.get(0)?.get("displayName")).toBe("Pat");
  });

  it("defaults missing signUps to empty list", () => {
    const storage = buildInitialStorage([
      {
        id: "i2",
        name: "Solo",
        quantity: null,
        quantityMax: null,
        signUps: [],
      },
    ]);
    expect(storage.items.get(0)?.get("signUps")?.length).toBe(0);
  });
});

describe("PackingListEditor", () => {
  beforeEach(() => {
    editorStorage.items = null;
    syncPackingListToDatabase.mockClear();
    vi.clearAllMocks();
  });

  it("shows connecting state when storage items are not ready", () => {
    editorStorage.items = null;
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
    render(
      <PackingListEditor
        roomId="r1"
        authUser={{ dbUserId: "u1", name: "A", email: "a@b.c" }}
        guestDisplayName={null}
        canManageTemplate
      />,
    );
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add item" }),
    ).toBeInTheDocument();
  });

  it("renders a row for each storage item", () => {
    editorStorage.items = [
      {
        id: "row-1",
        name: "Lantern",
        quantity: 2,
        quantityMax: null,
        section: null,
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

  it("Needs sign-ups view hides covered items", async () => {
    const user = userEvent.setup();
    editorStorage.items = [
      {
        id: "full",
        name: "Cooler",
        quantity: 1,
        quantityMax: null,
        section: null,
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
        section: null,
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
    editorStorage.items = [
      {
        id: "k1",
        name: "Plates",
        quantity: 1,
        quantityMax: null,
        section: "Kitchen",
        signUps: [],
      },
      {
        id: "g1",
        name: "Tent",
        quantity: 1,
        quantityMax: null,
        section: "Gear",
        signUps: [],
      },
      {
        id: "k2",
        name: "Cups",
        quantity: 1,
        quantityMax: null,
        section: "Kitchen",
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
    const dataRows = rows.filter((r) => r.querySelector("input[aria-label='Item name']"));
    expect(dataRows.map((r) => r.querySelector("input[aria-label='Item name']")))
      .toEqual([
        expect.objectContaining({ value: "Plates" }),
        expect.objectContaining({ value: "Cups" }),
        expect.objectContaining({ value: "Tent" }),
      ]);
  });

  it("schedules sync after debounce when items exist", async () => {
    vi.useFakeTimers();
    editorStorage.items = [
      {
        id: "row-sync",
        name: "Mug",
        quantity: 1,
        quantityMax: null,
        section: null,
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
      expect.arrayContaining([
        expect.objectContaining({ id: "row-sync", name: "Mug" }),
      ]),
      { guestDisplayName: null },
    );
    vi.useRealTimers();
  });
});
