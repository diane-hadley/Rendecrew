"use client";

import { LiveList, LiveObject } from "@liveblocks/client";
import {
  useCanRedo,
  useCanUndo,
  useMutation,
  useRedo,
  useStorage,
  useSyncStatus,
  useUndo,
} from "@liveblocks/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { syncPackingListToDatabase } from "@/app/actions/packing-list";
import type { PackingItemPayload } from "@/lib/packing-list";
import {
  isOptionalPackingMin,
  itemQuantityCap,
  packingItemNeedsSignUps,
} from "@/lib/packing-quantity";
import type {
  PackingItemStorage,
  PackingSignUpStorage,
} from "@/liveblocks.config";

type AuthUser = { dbUserId: string; name: string; email: string };

type StorageSignUp = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
  packed: boolean;
};

type StorageRow = {
  id: string;
  section?: string | null;
  name: string;
  quantity: number | null;
  quantityMax?: number | null;
  signUps?: readonly StorageSignUp[] | null;
  claimedByName?: string | null;
  claimedByEmail?: string | null;
  claimedByUserId?: string | null;
  claimedQuantity?: number | null;
};

function normalizedSection(row: StorageRow): string | null {
  const s = row.section;
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/** Stable key for grouping rows by section (uncategorized → ""). */
function sectionSortKey(row: StorageRow): string {
  return normalizedSection(row) ?? "";
}

/**
 * Order in which each section first appears in storage. Keeps section blocks in
 * document order while allowing filtered views to list same-section rows together.
 */
function sectionFirstAppearanceRanks(
  allItems: readonly StorageRow[],
): Map<string, number> {
  const ranks = new Map<string, number>();
  let next = 0;
  for (const item of allItems) {
    const key = sectionSortKey(item);
    if (!ranks.has(key)) ranks.set(key, next++);
  }
  return ranks;
}

function sortRowsBySectionRun(
  rows: Array<{ item: StorageRow; index: number }>,
  allItems: readonly StorageRow[],
): Array<{ item: StorageRow; index: number }> {
  const ranks = sectionFirstAppearanceRanks(allItems);
  return [...rows].sort((a, b) => {
    const ra = ranks.get(sectionSortKey(a.item)) ?? 0;
    const rb = ranks.get(sectionSortKey(b.item)) ?? 0;
    if (ra !== rb) return ra - rb;
    return a.index - b.index;
  });
}

function readSignUps(row: StorageRow): StorageSignUp[] {
  if (Array.isArray(row.signUps) && row.signUps.length > 0) {
    return row.signUps.map((s) => ({
      id: s.id,
      quantity: s.quantity ?? null,
      displayName: s.displayName,
      email: s.email ?? null,
      userId: s.userId ?? null,
      packed: Boolean(s.packed),
    }));
  }
  if (Array.isArray(row.signUps) && row.signUps.length === 0) {
    if (!row.claimedByName?.trim() && !row.claimedByUserId?.trim()) {
      return [];
    }
  }
  if (row.claimedByName?.trim() || row.claimedByUserId?.trim()) {
    const total = row.quantity;
    const cq = row.claimedQuantity;
    return [
      {
        id: `legacy-${row.id}`,
        quantity:
          typeof cq === "number"
            ? cq
            : typeof total === "number" && total > 0
              ? total
              : null,
        displayName: row.claimedByName?.trim() || "Member",
        email: row.claimedByEmail ?? null,
        userId: row.claimedByUserId?.trim() || null,
        packed: false,
      },
    ];
  }
  if (Array.isArray(row.signUps)) return [];
  return [];
}

function storageToPayload(
  items: readonly StorageRow[] | undefined | null,
): PackingItemPayload[] {
  if (!items?.length) return [];
  return items.map((row) => ({
    id: row.id,
    section: normalizedSection(row),
    name: row.name,
    quantity: row.quantity,
    quantityMax: row.quantityMax ?? null,
    signUps: readSignUps(row).map((s) => ({
      id: s.id,
      quantity: s.quantity,
      displayName: s.displayName,
      email: s.email,
      userId: s.userId,
      packed: s.packed,
    })),
  }));
}

function allocatedSum(signUps: StorageSignUp[]): number {
  return signUps.reduce((a, s) => a + (s.quantity ?? 0), 0);
}

function remainingUntilCap(
  cap: number | null,
  signUps: StorageSignUp[],
): number | null {
  if (cap == null) return null;
  return Math.max(0, cap - allocatedSum(signUps));
}

function remainingUntilMin(
  min: number | null,
  signUps: StorageSignUp[],
): number | null {
  if (min == null) return null;
  return Math.max(0, min - allocatedSum(signUps));
}

/** Clamp total sign-ups to cap by trimming from the end of the list. */
function clampSignUpsOverCap(
  signUps: LiveList<LiveObject<PackingSignUpStorage>>,
  cap: number,
): void {
  let over = allocatedSum(snapshotSignUps(signUps)) - cap;
  while (over > 0 && signUps.length > 0) {
    const lastIdx = signUps.length - 1;
    const su = signUps.get(lastIdx);
    if (!su) break;
    const q = (su.get("quantity") as number | null) ?? 1;
    if (q <= over) {
      over -= q;
      signUps.delete(lastIdx);
    } else {
      su.set("quantity", q - over);
      over = 0;
    }
  }
}

function isMineSignUp(
  su: StorageSignUp,
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): boolean {
  if (authUser) return su.userId === authUser.dbUserId;
  if (guestDisplayName)
    return !su.userId && su.displayName === guestDisplayName;
  return false;
}

function findMySignUp(
  signUps: StorageSignUp[],
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): StorageSignUp | null {
  return (
    signUps.find((s) => isMineSignUp(s, authUser, guestDisplayName)) ?? null
  );
}

export function PackingListEditor({
  roomId,
  authUser,
  guestDisplayName,
  canManageTemplate,
  persistToDatabase = true,
}: {
  roomId: string;
  authUser: AuthUser | null;
  guestDisplayName: string | null;
  /** Event organizers may edit shared rows; everyone else only manages their own sign-ups. */
  canManageTemplate: boolean;
  /**
   * When false, storage updates are not synced to Postgres (e.g. while another tab is visible).
   * Avoids repeated persist while Liveblocks still streams updates in the background.
   */
  persistToDatabase?: boolean;
}) {
  const ctxRef = useRef({ authUser, guestDisplayName });
  ctxRef.current = { authUser, guestDisplayName };

  const rawItems = useStorage((root) => root.items);
  const syncStatus = useSyncStatus({ smooth: true });
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [editingNeededIndex, setEditingNeededIndex] = useState<number | null>(
    null,
  );
  const [listView, setListView] = useState<"all" | "needsSignUps">("all");
  const migratedRef = useRef(false);

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = useCallback(
    (payload: PackingItemPayload[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(async () => {
        persistTimer.current = null;
        const { authUser: au, guestDisplayName: gn } = ctxRef.current;
        const result = await syncPackingListToDatabase(roomId, payload, {
          guestDisplayName: au ? null : gn,
        });
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setSaveError(null);
        }
      }, 900);
    },
    [roomId],
  );

  const migrateLegacySignUps = useMutation(({ storage }) => {
    const items = storage.get("items");
    for (let i = 0; i < items.length; i++) {
      const row = items.get(i);
      if (!row) continue;
      if (row.get("signUps") != null) continue;
      const list = new LiveList<LiveObject<PackingSignUpStorage>>([]);
      const legacy = row as unknown as {
        get: (k: string) => unknown;
        set: (k: string, v: unknown) => void;
      };
      const ln = legacy.get("claimedByName") as string | null | undefined;
      const lu = legacy.get("claimedByUserId") as string | null | undefined;
      const le = legacy.get("claimedByEmail") as string | null | undefined;
      const lq = legacy.get("claimedQuantity") as number | null | undefined;
      const qty = row.get("quantity") as number | null;
      if (ln || lu) {
        list.push(
          new LiveObject({
            id: crypto.randomUUID(),
            quantity:
              typeof lq === "number"
                ? lq
                : typeof qty === "number" && qty > 0
                  ? qty
                  : null,
            displayName: (ln && String(ln).trim()) || "Member",
            email: le ?? null,
            userId: lu ?? null,
            packed: false,
          }),
        );
      }
      row.set("signUps", list as never);
    }
  }, []);

  useEffect(() => {
    if (rawItems === undefined || rawItems === null) return;
    if (migratedRef.current) return;
    migratedRef.current = true;
    migrateLegacySignUps();
  }, [rawItems, migrateLegacySignUps]);

  useEffect(() => {
    if (!persistToDatabase) {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      return;
    }
    if (rawItems === undefined || rawItems === null) {
      return () => {
        if (persistTimer.current) clearTimeout(persistTimer.current);
      };
    }
    const payload = storageToPayload(rawItems as StorageRow[]);
    schedulePersist(payload);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [rawItems, schedulePersist, persistToDatabase]);

  useEffect(() => {
    if (!canManageTemplate) setEditingNeededIndex(null);
  }, [canManageTemplate]);

  useEffect(() => {
    if (editingNeededIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingNeededIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingNeededIndex]);

  useEffect(() => {
    if (
      editingNeededIndex != null &&
      rawItems != null &&
      editingNeededIndex >= rawItems.length
    ) {
      setEditingNeededIndex(null);
    }
  }, [rawItems, editingNeededIndex]);

  const addItem = useMutation(
    ({ storage }, opts?: { startIndex: number; runSection: string | null }) => {
      const items = storage.get("items");
      const signUps = new LiveList<LiveObject<PackingSignUpStorage>>([]);

      if (opts && typeof opts.startIndex === "number") {
        const targetSec =
          opts.runSection === null
            ? null
            : (() => {
                const t = opts.runSection.trim();
                return t === "" ? null : t;
              })();
        let lastInRun = opts.startIndex;
        for (let k = opts.startIndex + 1; k < items.length; k++) {
          const row = items.get(k);
          if (!row) break;
          const raw = row.get("section") as string | null | undefined;
          const t = typeof raw === "string" ? raw.trim() : "";
          const rowSec = t === "" ? null : t;
          if (rowSec === targetSec) lastInRun = k;
          else break;
        }
        items.insert(
          new LiveObject({
            id: crypto.randomUUID(),
            section: targetSec,
            name: "New item",
            quantity: null,
            quantityMax: null,
            signUps,
          }),
          lastInRun + 1,
        );
        return;
      }

      items.push(
        new LiveObject({
          id: crypto.randomUUID(),
          section: null,
          name: "New item",
          quantity: null,
          quantityMax: null,
          signUps,
        }),
      );
    },
    [],
  );

  const removeItem = useMutation(({ storage }, index: number) => {
    const items = storage.get("items");
    items.delete(index);
  }, []);

  const updateName = useMutation(
    ({ storage }, { index, name }: { index: number; name: string }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (row) row.set("name", name);
    },
    [],
  );

  const updateSection = useMutation(
    ({ storage }, { index, section }: { index: number; section: string }) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      row.set("section", section.trim() === "" ? null : section);
    },
    [],
  );

  const updateQuantity = useMutation(
    (
      { storage },
      { index, quantity }: { index: number; quantity: number | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      row.set("quantity", quantity);
      if (quantity == null) {
        row.set("quantityMax", null);
        return;
      }
      const maxRaw = row.get("quantityMax") as number | null | undefined;
      let nextMax: number | null =
        maxRaw != null && typeof maxRaw === "number" ? maxRaw : null;
      if (quantity > 0 && nextMax != null && nextMax <= quantity) {
        nextMax = null;
      }
      row.set("quantityMax", nextMax);
      const signUps = row.get("signUps");
      if (!signUps) return;
      const cap = itemQuantityCap(quantity, nextMax);
      if (cap == null) return;
      clampSignUpsOverCap(signUps, cap);
    },
    [],
  );

  const updateQuantityMax = useMutation(
    (
      { storage },
      { index, quantityMax }: { index: number; quantityMax: number | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      const min = row.get("quantity") as number | null;
      if (min == null) {
        row.set("quantityMax", null);
        return;
      }
      let nextMax = quantityMax;
      if (nextMax != null && nextMax < min) nextMax = min;
      if (min > 0 && nextMax != null && nextMax <= min) nextMax = null;
      row.set("quantityMax", nextMax);
      const signUps = row.get("signUps");
      if (!signUps) return;
      const cap = itemQuantityCap(min, nextMax);
      if (cap == null) return;
      clampSignUpsOverCap(signUps, cap);
    },
    [],
  );

  /** Optional items are stored as min 0 + max cap (no DB flag). */
  const setItemOptionalMode = useMutation(
    (
      { storage },
      { index, optional }: { index: number; optional: boolean },
    ) => {
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      if (optional) {
        const prevMax = row.get("quantityMax") as number | null | undefined;
        row.set("quantity", 0);
        const keepMax =
          prevMax != null && typeof prevMax === "number" && prevMax > 0
            ? prevMax
            : null;
        row.set("quantityMax", keepMax);
      } else {
        row.set("quantity", null);
        row.set("quantityMax", null);
      }
      const signUps = row.get("signUps");
      if (!signUps) return;
      const q = row.get("quantity") as number | null;
      const qm = row.get("quantityMax") as number | null | undefined;
      const cap = itemQuantityCap(q, qm ?? null);
      if (cap != null) clampSignUpsOverCap(signUps, cap);
    },
    [],
  );

  const addMySignUp = useMutation(({ storage }, index: number) => {
    const { authUser: au, guestDisplayName: gn } = ctxRef.current;
    if (!au && !gn?.trim()) return;
    const items = storage.get("items");
    const row = items.get(index);
    if (!row) return;
    let signUps = row.get("signUps");
    if (!signUps) {
      const list = new LiveList<LiveObject<PackingSignUpStorage>>([]);
      row.set("signUps", list as never);
      signUps = list as never;
    }
    const g = gn?.trim() ?? null;
    for (let i = 0; i < signUps.length; i++) {
      const s = signUps.get(i);
      if (!s) continue;
      if (au && s.get("userId") === au.dbUserId) return;
      if (!au && g && !s.get("userId") && s.get("displayName") === g) return;
    }
    const itemQty = row.get("quantity") as number | null;
    const itemMax = row.get("quantityMax") as number | null | undefined;
    const cap = itemQuantityCap(itemQty, itemMax ?? null);
    let sum = 0;
    for (let i = 0; i < signUps.length; i++) {
      const s = signUps.get(i);
      if (!s) continue;
      sum += (s.get("quantity") as number | null) ?? 0;
    }
    const rem = cap != null ? Math.max(0, cap - sum) : null;
    if (cap != null && rem != null && rem < 1) return;

    const newQuantity = rem != null ? Math.min(1, rem) : 1;

    signUps.push(
      new LiveObject({
        id: crypto.randomUUID(),
        quantity: newQuantity,
        displayName: au ? au.name : g!,
        email: au ? au.email.trim().toLowerCase() : null,
        userId: au ? au.dbUserId : null,
        packed: false,
      }),
    );
  }, []);

  const removeMySignUp = useMutation(({ storage }, index: number) => {
    const { authUser: au, guestDisplayName: gn } = ctxRef.current;
    const items = storage.get("items");
    const row = items.get(index);
    if (!row) return;
    const signUps = row.get("signUps");
    if (!signUps) return;
    const g = gn?.trim() ?? null;
    for (let i = signUps.length - 1; i >= 0; i--) {
      const s = signUps.get(i);
      if (!s) continue;
      if (au && s.get("userId") === au.dbUserId) {
        signUps.delete(i);
        return;
      }
      if (!au && g && !s.get("userId") && s.get("displayName") === g) {
        signUps.delete(i);
        return;
      }
    }
  }, []);

  const updateSignUpQuantity = useMutation(
    (
      { storage },
      {
        itemIndex,
        signUpId,
        quantity: nextQty,
      }: { itemIndex: number; signUpId: string; quantity: number | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(itemIndex);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      const itemQty = row.get("quantity") as number | null;
      const itemMax = row.get("quantityMax") as number | null | undefined;
      const cap = itemQuantityCap(itemQty, itemMax ?? null);
      let target: NonNullable<ReturnType<typeof signUps.get>> | null = null;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) {
          target = s;
          break;
        }
      }
      if (!target) return;

      const { authUser: au, guestDisplayName: gn } = ctxRef.current;
      const mine = isMineSignUp(
        {
          id: String(target.get("id")),
          quantity: (target.get("quantity") as number | null) ?? null,
          displayName: String(target.get("displayName") ?? ""),
          email: (target.get("email") as string | null) ?? null,
          userId: (target.get("userId") as string | null) ?? null,
          packed: Boolean(target.get("packed")),
        },
        au,
        gn,
      );
      if (!mine) return;

      let otherSum = 0;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) continue;
        otherSum += (s.get("quantity") as number | null) ?? 0;
      }
      const maxForMe = cap != null ? Math.max(1, cap - otherSum) : 999_999;
      if (cap != null) {
        const n =
          nextQty == null ? maxForMe : Math.max(1, Math.min(nextQty, maxForMe));
        target.set("quantity", n);
      } else {
        if (nextQty == null) target.set("quantity", null);
        else target.set("quantity", Math.max(1, Math.min(nextQty, maxForMe)));
      }
    },
    [],
  );

  const setSignUpEmail = useMutation(
    (
      { storage },
      {
        itemIndex,
        signUpId,
        email,
      }: { itemIndex: number; signUpId: string; email: string | null },
    ) => {
      const items = storage.get("items");
      const row = items.get(itemIndex);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      const { authUser: au, guestDisplayName: gn } = ctxRef.current;
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") === signUpId) {
          const mine = isMineSignUp(
            {
              id: String(s.get("id")),
              quantity: (s.get("quantity") as number | null) ?? null,
              displayName: String(s.get("displayName") ?? ""),
              email: (s.get("email") as string | null) ?? null,
              userId: (s.get("userId") as string | null) ?? null,
              packed: Boolean(s.get("packed")),
            },
            au,
            gn,
          );
          if (!mine) return;
          s.set("email", email);
          return;
        }
      }
    },
    [],
  );

  if (rawItems === undefined || rawItems === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">Connecting…</p>
    );
  }

  const items = rawItems as StorageRow[];

  const visibleRows = sortRowsBySectionRun(
    items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (listView === "all") return true;
        return packingItemNeedsSignUps(
          item.quantity,
          item.quantityMax,
          readSignUps(item),
        );
      }),
    items,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span>
          {syncStatus === "synchronizing" ? "Syncing…" : "Up to date"}
        </span>
        {saveError && (
          <span className="text-red-600 dark:text-red-400" role="alert">
            {saveError}
          </span>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Undo and redo your recent edits"
      >
        <button
          type="button"
          disabled={!canUndo}
          onClick={undo}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={redo}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Redo
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-500">
          Applies to edits you made on this device.
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Packing list view"
      >
        <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
          <button
            type="button"
            aria-pressed={listView === "all"}
            onClick={() => setListView("all")}
            className={`px-3 py-1.5 text-sm font-medium ${
              listView === "all"
                ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
            }`}
          >
            All items
          </button>
          <button
            type="button"
            aria-pressed={listView === "needsSignUps"}
            onClick={() => setListView("needsSignUps")}
            className={`border-l border-gray-300 px-3 py-1.5 text-sm font-medium dark:border-gray-600 ${
              listView === "needsSignUps"
                ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
            }`}
          >
            Needs sign-ups
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-950">
        <table className="w-full min-w-[920px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-900">
              <th
                scope="col"
                className="w-32 border border-gray-300 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Section
              </th>
              <th
                scope="col"
                className="border border-gray-300 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Item
              </th>
              <th
                scope="col"
                className="w-32 border border-gray-300 p-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Needed
              </th>
              <th
                scope="col"
                className="w-28 border border-gray-300 p-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Filled
              </th>
              <th
                scope="col"
                className="w-36 border border-gray-300 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Sign up
              </th>
              <th
                scope="col"
                className="min-w-40 border border-gray-300 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Who&apos;s bringing
              </th>
              <th
                scope="col"
                className="w-24 border border-gray-300 p-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 &&
            listView === "needsSignUps" &&
            items.length > 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="border border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400"
                >
                  Every item is covered — nothing is waiting for sign-ups.
                </td>
              </tr>
            ) : null}
            {visibleRows.map(({ item, index }, visiblePos) => {
              const signUps = readSignUps(item);
              const qMin = item.quantity;
              const qMax =
                item.quantityMax != null &&
                qMin != null &&
                item.quantityMax >= qMin
                  ? item.quantityMax
                  : null;
              const cap = itemQuantityCap(qMin, qMax);
              const isOptionalItem = isOptionalPackingMin(qMin);
              const isRange =
                qMin != null && qMin > 0 && qMax != null && qMax > qMin;
              const sum = allocatedSum(signUps);
              const remCap = remainingUntilCap(cap, signUps);
              const remMin = remainingUntilMin(qMin, signUps);
              const mySu = findMySignUp(signUps, authUser, guestDisplayName);
              const canSignUpMore =
                authUser || guestDisplayName
                  ? cap == null || (remCap != null && remCap >= 1)
                  : false;

              const sec = normalizedSection(item);
              const prevItem =
                visiblePos > 0 ? visibleRows[visiblePos - 1]!.item : null;
              const prevSec = prevItem ? normalizedSection(prevItem) : null;
              const showNamedSectionHeader = sec != null && sec !== prevSec;
              const showUncategorizedHeader =
                sec == null && (visiblePos === 0 || prevSec != null);
              const sectionHeader = showNamedSectionHeader
                ? { label: sec, runSection: sec }
                : showUncategorizedHeader
                  ? { label: "Uncategorized", runSection: null }
                  : null;

              const cellBorder =
                "border border-gray-300 dark:border-gray-600 align-middle";

              return (
                <Fragment key={item.id}>
                  {sectionHeader && (
                    <tr className="bg-gray-200/90 dark:bg-gray-800">
                      <td
                        colSpan={7}
                        className="border border-gray-300 px-3 py-2 dark:border-gray-600"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
                            {sectionHeader.label}
                          </span>
                          {canManageTemplate ? (
                            <button
                              type="button"
                              onClick={() =>
                                addItem({
                                  startIndex: index,
                                  runSection: sectionHeader.runSection,
                                })
                              }
                              className="shrink-0 rounded-md border border-gray-400/80 bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-white dark:border-gray-500 dark:bg-gray-900/80 dark:text-gray-100 dark:hover:bg-gray-900"
                            >
                              Add item
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-white hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900/80">
                    <td className={`${cellBorder} p-0`}>
                      <input
                        type="text"
                        readOnly={!canManageTemplate}
                        value={item.section ?? ""}
                        onChange={(e) =>
                          updateSection({ index, section: e.target.value })
                        }
                        placeholder="—"
                        className={`w-full min-w-24 border-0 p-2 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:text-gray-300 dark:placeholder:text-gray-500 dark:focus:ring-blue-400 ${
                          canManageTemplate
                            ? "bg-transparent"
                            : "cursor-default bg-gray-50/80 dark:bg-gray-900/50"
                        }`}
                        aria-label="Section"
                      />
                    </td>
                    <td className={`${cellBorder} p-0`}>
                      <input
                        type="text"
                        readOnly={!canManageTemplate}
                        value={item.name}
                        onChange={(e) =>
                          updateName({ index, name: e.target.value })
                        }
                        className={`w-full min-w-32 border-0 p-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:text-gray-100 dark:focus:ring-blue-400 ${
                          canManageTemplate
                            ? "bg-transparent"
                            : "cursor-default bg-gray-50/80 dark:bg-gray-900/50"
                        }`}
                        aria-label="Item name"
                      />
                    </td>
                    <td className={`${cellBorder} p-0 text-center`}>
                      {canManageTemplate && editingNeededIndex === index ? (
                        <div
                          className="flex flex-col gap-1.5 p-1"
                          onBlur={(e) => {
                            const next = e.relatedTarget as Node | null;
                            if (next && e.currentTarget.contains(next)) return;
                            setEditingNeededIndex(null);
                          }}
                        >
                          <label className="flex cursor-pointer items-center gap-2 px-0.5 text-left text-[0.7rem] text-gray-600 dark:text-gray-400">
                            <input
                              type="checkbox"
                              checked={isOptionalItem}
                              onChange={(e) =>
                                setItemOptionalMode({
                                  index,
                                  optional: e.target.checked,
                                })
                              }
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <span>Optional (no minimum)</span>
                          </label>
                          {isOptionalItem ? (
                            <input
                              type="number"
                              min={1}
                              placeholder="Up to (if brought)"
                              autoFocus
                              value={
                                item.quantityMax != null && item.quantityMax > 0
                                  ? item.quantityMax
                                  : ""
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                updateQuantityMax({
                                  index,
                                  quantityMax:
                                    v === ""
                                      ? null
                                      : Math.max(1, parseInt(v, 10) || 0),
                                });
                              }}
                              className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                              aria-label="Maximum to bring if optional item is covered"
                            />
                          ) : (
                            <>
                              <input
                                type="number"
                                min={0}
                                placeholder="Min"
                                autoFocus
                                value={item.quantity ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateQuantity({
                                    index,
                                    quantity:
                                      v === ""
                                        ? null
                                        : Math.max(0, parseInt(v, 10) || 0),
                                  });
                                }}
                                className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                                aria-label="Minimum quantity needed"
                              />
                              <input
                                type="number"
                                min={0}
                                placeholder="Max (optional range)"
                                disabled={item.quantity == null}
                                value={
                                  item.quantity == null
                                    ? ""
                                    : (item.quantityMax ?? "")
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateQuantityMax({
                                    index,
                                    quantityMax:
                                      v === ""
                                        ? null
                                        : Math.max(0, parseInt(v, 10) || 0),
                                  });
                                }}
                                className="w-full min-w-0 rounded border border-gray-300 bg-white p-1 text-center text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-blue-400"
                                aria-label="Maximum quantity (optional range above min)"
                              />
                            </>
                          )}
                        </div>
                      ) : canManageTemplate ? (
                        <button
                          type="button"
                          onClick={() => setEditingNeededIndex(index)}
                          className="min-h-11 w-full p-2 text-center text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900/80"
                          aria-label={
                            qMin == null
                              ? "Needed: not set, click to edit"
                              : isOptionalItem
                                ? qMax != null
                                  ? `Needed: optional, up to ${qMax}, click to edit`
                                  : "Needed: optional, click to edit"
                                : isRange
                                  ? `Needed: ${qMin} to ${qMax}, click to edit`
                                  : `Needed: ${qMin}, click to edit`
                          }
                        >
                          {qMin == null ? (
                            "—"
                          ) : isOptionalItem ? (
                            <span className="flex flex-col items-center gap-0.5 leading-tight">
                              <span>Optional</span>
                              {qMax != null ? (
                                <span className="text-[0.65rem] font-normal text-gray-500 dark:text-gray-400">
                                  up to {qMax}
                                </span>
                              ) : null}
                            </span>
                          ) : isRange ? (
                            `${qMin} – ${qMax}`
                          ) : (
                            qMin
                          )}
                        </button>
                      ) : (
                        <div className="min-h-11 w-full p-2 text-center text-sm text-gray-900 dark:text-gray-100">
                          {qMin == null ? (
                            "—"
                          ) : isOptionalItem ? (
                            <span className="flex flex-col items-center gap-0.5 leading-tight">
                              <span>Optional</span>
                              {qMax != null ? (
                                <span className="text-[0.65rem] font-normal text-gray-500 dark:text-gray-400">
                                  up to {qMax}
                                </span>
                              ) : null}
                            </span>
                          ) : isRange ? (
                            `${qMin} – ${qMax}`
                          ) : (
                            qMin
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className={`${cellBorder} p-2 text-center text-xs text-gray-600 dark:text-gray-400`}
                    >
                      {qMin != null ? (
                        <div>
                          <div>
                            {isOptionalItem ? (
                              qMax != null ? (
                                <>
                                  {sum} / {qMax}
                                </>
                              ) : (
                                sum
                              )
                            ) : isRange ? (
                              <>
                                {sum} / {qMin} – {qMax}
                              </>
                            ) : (
                              sum
                            )}
                          </div>
                          {isOptionalItem ? (
                            <>
                              {qMax != null && remCap != null && remCap > 0 && (
                                <div className="mt-0.5 text-sky-700 dark:text-sky-400">
                                  {remCap} more welcome
                                </div>
                              )}
                              {qMax != null &&
                                remCap === 0 &&
                                signUps.length > 0 && (
                                  <div className="mt-0.5 text-green-700 dark:text-green-400">
                                    Covered
                                  </div>
                                )}
                            </>
                          ) : isRange ? (
                            <>
                              {remMin != null && remMin > 0 && (
                                <div className="mt-0.5 text-amber-700 dark:text-amber-400">
                                  {remMin} to minimum
                                </div>
                              )}
                              {remMin === 0 && remCap != null && remCap > 0 && (
                                <div className="mt-0.5 text-sky-700 dark:text-sky-400">
                                  Min met · {remCap} until max
                                </div>
                              )}
                              {remCap === 0 && signUps.length > 0 && (
                                <div className="mt-0.5 text-green-700 dark:text-green-400">
                                  At max
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {remCap != null && remCap > 0 && (
                                <div className="mt-0.5 text-amber-700 dark:text-amber-400">
                                  {remCap} left
                                </div>
                              )}
                              {remCap === 0 && signUps.length > 0 && (
                                <div className="mt-0.5 text-green-700 dark:text-green-400">
                                  Covered
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <span>
                          {signUps.length ? `${signUps.length} signed up` : "—"}
                        </span>
                      )}
                    </td>
                    <td className={`${cellBorder} px-2 py-1.5`}>
                      <button
                        type="button"
                        onClick={() =>
                          mySu ? removeMySignUp(index) : addMySignUp(index)
                        }
                        disabled={
                          (!authUser && !guestDisplayName) ||
                          (!mySu && !canSignUpMore)
                        }
                        className="w-full rounded border border-transparent bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {mySu ? "Cancel sign-up" : "Sign up to bring"}
                      </button>
                    </td>
                    <td
                      className={`${cellBorder} p-2 text-gray-600 dark:text-gray-400`}
                    >
                      {signUps.length === 0 ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <ul className="space-y-2 text-xs">
                          {signUps.map((su) => {
                            const mine = isMineSignUp(
                              su,
                              authUser,
                              guestDisplayName,
                            );
                            return (
                              <li
                                key={su.id}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span
                                  className={
                                    mine
                                      ? "font-medium text-blue-800 dark:text-blue-300"
                                      : ""
                                  }
                                >
                                  {su.displayName}
                                  {mine ? " (you)" : ""}
                                </span>
                                <span className="text-gray-500">·</span>
                                {mine ? (
                                  <input
                                    type="number"
                                    min={1}
                                    max={cap ?? undefined}
                                    value={su.quantity ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value.trim();
                                      if (v === "") {
                                        updateSignUpQuantity({
                                          itemIndex: index,
                                          signUpId: su.id,
                                          quantity: null,
                                        });
                                        return;
                                      }
                                      const n = parseInt(v, 10);
                                      if (!Number.isFinite(n)) return;
                                      updateSignUpQuantity({
                                        itemIndex: index,
                                        signUpId: su.id,
                                        quantity: n,
                                      });
                                    }}
                                    className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-center dark:border-gray-600 dark:bg-gray-950"
                                    aria-label="How many you bring"
                                  />
                                ) : (
                                  <span>{su.quantity ?? "—"}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                    <td className={`${cellBorder} px-2 py-1.5 text-center`}>
                      {canManageTemplate ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemoveIndex(index)}
                          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-600">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                  {mySu && !authUser && (
                    <tr className="bg-gray-50 dark:bg-gray-900/60">
                      <td
                        colSpan={7}
                        className="border border-gray-300 px-3 py-2 dark:border-gray-600"
                      >
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          Add your email (optional) so we can link this to your
                          Rendecrew account if you sign up later.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="email"
                            placeholder="you@example.com"
                            value={
                              emailDrafts[`${item.id}:${mySu.id}`] ??
                              mySu.email ??
                              ""
                            }
                            onChange={(e) =>
                              setEmailDrafts((d) => ({
                                ...d,
                                [`${item.id}:${mySu.id}`]: e.target.value,
                              }))
                            }
                            className="min-w-48 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-950"
                          />
                          <button
                            type="button"
                            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => {
                              const raw =
                                emailDrafts[`${item.id}:${mySu.id}`] ??
                                mySu.email ??
                                "";
                              const trimmed = raw.trim();
                              setSignUpEmail({
                                itemIndex: index,
                                signUpId: mySu.id,
                                email:
                                  trimmed === "" ? null : trimmed.toLowerCase(),
                              });
                            }}
                          >
                            Save email
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManageTemplate ? (
        <button
          type="button"
          onClick={() => addItem()}
          className="rounded-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Add item
        </button>
      ) : null}

      {pendingRemoveIndex != null && canManageTemplate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="packing-remove-title"
        >
          <div className="max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-lg dark:border-gray-600 dark:bg-gray-900">
            <h3
              id="packing-remove-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Remove this item?
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This removes{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {items[pendingRemoveIndex]?.name ?? "this item"}
              </span>{" "}
              and all sign-ups for it from the shared list.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoveIndex(null)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const i = pendingRemoveIndex;
                  setPendingRemoveIndex(null);
                  if (i != null) removeItem(i);
                }}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
              >
                Remove item
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Snapshot LiveList sign-ups for sum math inside mutations (best-effort). */
function snapshotSignUps(signUps: unknown): StorageSignUp[] {
  const xs = signUps as {
    length: number;
    get: (i: number) => { get: (k: string) => unknown } | undefined;
  };
  const out: StorageSignUp[] = [];
  for (let i = 0; i < xs.length; i++) {
    const s = xs.get(i);
    if (!s) continue;
    const g = s as { get: (k: string) => unknown };
    out.push({
      id: String(g.get("id")),
      quantity: (g.get("quantity") as number | null) ?? null,
      displayName: String(g.get("displayName") ?? ""),
      email: (g.get("email") as string | null) ?? null,
      userId: (g.get("userId") as string | null) ?? null,
      packed: Boolean(g.get("packed")),
    });
  }
  return out;
}

export function buildInitialStorage(items: PackingItemPayload[]): {
  items: LiveList<LiveObject<PackingItemStorage>>;
} {
  return {
    items: new LiveList(
      items.map(
        (i) =>
          new LiveObject({
            id: i.id,
            section: i.section ?? null,
            name: i.name,
            quantity: i.quantity,
            quantityMax: i.quantityMax ?? null,
            signUps: new LiveList(
              (i.signUps ?? []).map(
                (s) =>
                  new LiveObject({
                    id: s.id,
                    quantity: s.quantity,
                    displayName: s.displayName,
                    email: s.email,
                    userId: s.userId,
                    packed: s.packed,
                  }),
              ),
            ),
          }),
      ),
    ),
  } as { items: LiveList<LiveObject<PackingItemStorage>> };
}
