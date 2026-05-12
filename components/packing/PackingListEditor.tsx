"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LiveList, LiveObject } from "@liveblocks/client";
import {
  useCanRedo,
  useCanUndo,
  useMutation,
  useRedo,
  useRoom,
  useStorage,
  useUndo,
} from "@liveblocks/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { syncPackingListToDatabase } from "@/app/actions/packing-list";
import type {
  PackingItemPayload,
  PackingListSyncPayload,
  PackingSectionPayload,
} from "@/lib/packing-list";
import { EditSectionsModal, type EditSectionRow } from "./EditSectionsModal";
import {
  isOptionalPackingMin,
  itemQuantityCap,
  packingItemNeedsSignUps,
} from "@/lib/packing-quantity";
import type {
  PackingItemStorage,
  PackingSectionStorage,
  PackingSignUpStorage,
} from "@/liveblocks.config";

/** Mirrors `MAX_SECTION_LEN` in `@/lib/packing-list` (avoid importing server lib in client). */
const MAX_SECTION_LEN = 120;

type AuthUser = { dbUserId: string; name: string; email: string };

type PackingSignupMemberOption = {
  userId: string;
  name: string;
};

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
  sectionId?: string | null;
  /** @deprecated Migrated to sectionId */
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

const UNCATEGORIZED_SENTINEL = "__uncategorized__";
/** Must stay aligned with `MAX_SECTIONS` in `@/lib/packing-list`. */
const MAX_PACKING_SECTIONS = 100;

const packingListDndAccessibility = {
  announcements: {
    onDragStart({ active }: { active: { id: string | number } }) {
      const id = String(active.id);
      return id.startsWith("s:")
        ? "Picked up section. Use arrow keys to move, then confirm to drop."
        : "Picked up item. Use arrow keys to move, then confirm to drop.";
    },
    onDragOver({ over }: { over: { id: string | number } | null }) {
      return over ? `Over ${String(over.id)}.` : undefined;
    },
    onDragEnd({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) {
      return over
        ? `Moved ${String(active.id)} next to ${String(over.id)}.`
        : "Move finished.";
    },
    onDragCancel() {
      return "Reordering cancelled.";
    },
  },
  screenReaderInstructions: {
    draggable:
      "Focus a drag handle, press Space or Enter to pick up, arrow keys to move, Space or Enter to drop, Escape to cancel.",
  },
};

function normalizedLegacySectionField(row: StorageRow): string | null {
  const s = row.section;
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function normalizeSectionTitleForPayload(title: string): string {
  return title.trim();
}

function readPersistedSectionId(
  row: StorageRow,
  validSectionIds: Set<string>,
): string | null {
  const raw = row.sectionId;
  if (raw == null || typeof raw !== "string" || raw.trim() === "") return null;
  return validSectionIds.has(raw) ? raw : null;
}

type ItemMeta = { id: string; sectionId: string | null };

function snapshotItemMeta(
  items: LiveList<LiveObject<PackingItemStorage>>,
): ItemMeta[] {
  const out: ItemMeta[] = [];
  for (let i = 0; i < items.length; i++) {
    const row = items.get(i);
    if (!row) continue;
    const sidRaw = row.get("sectionId") as string | null | undefined;
    const sid =
      typeof sidRaw === "string" && sidRaw.trim() !== "" ? sidRaw : null;
    out.push({ id: String(row.get("id")), sectionId: sid });
  }
  return out;
}

function snapshotSectionIds(
  sections: LiveList<LiveObject<PackingSectionStorage>>,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections.get(i);
    if (!s) continue;
    out.push(String(s.get("id")));
  }
  return out;
}

function buildCompositeKeys(
  sectionIdsInOrder: readonly string[],
  itemsInOrder: readonly ItemMeta[],
): string[] {
  const keys: string[] = [];
  const bySec = new Map<string, ItemMeta[]>();
  const unc: ItemMeta[] = [];
  for (const it of itemsInOrder) {
    if (it.sectionId == null) unc.push(it);
    else {
      let arr = bySec.get(it.sectionId);
      if (!arr) {
        arr = [];
        bySec.set(it.sectionId, arr);
      }
      arr.push(it);
    }
  }
  for (const sid of sectionIdsInOrder) {
    keys.push(`s:${sid}`);
    for (const it of bySec.get(sid) ?? []) keys.push(`i:${it.id}`);
  }
  // Only render Uncategorized when it actually has rows.
  if (unc.length > 0) {
    keys.push(`s:${UNCATEGORIZED_SENTINEL}`);
    for (const it of unc) keys.push(`i:${it.id}`);
  }
  return keys;
}

type ParsedKeyOrder = {
  sectionIds: string[];
  placements: Array<{ itemId: string; sectionId: string | null }>;
};

function parseKeyOrder(keys: readonly string[]): ParsedKeyOrder {
  const sectionIds: string[] = [];
  const placements: Array<{ itemId: string; sectionId: string | null }> = [];
  let currentSectionId: string | null = null;
  for (const k of keys) {
    if (k.startsWith("s:")) {
      const id = k.slice(2);
      if (id === UNCATEGORIZED_SENTINEL) {
        currentSectionId = null;
        continue;
      }
      sectionIds.push(id);
      currentSectionId = id;
    } else if (k.startsWith("i:")) {
      placements.push({ itemId: k.slice(2), sectionId: currentSectionId });
    }
  }
  return { sectionIds, placements };
}

function reorderLiveListByIds<T extends LiveObject<{ id: string }>>(
  list: LiveList<T>,
  targetIds: readonly string[],
  getId: (el: T) => string,
): void {
  for (let pos = 0; pos < targetIds.length; pos++) {
    const want = targetIds[pos]!;
    let from = -1;
    for (let i = pos; i < list.length; i++) {
      const el = list.get(i);
      if (el && getId(el) === want) {
        from = i;
        break;
      }
    }
    if (from < 0) {
      for (let i = 0; i < pos; i++) {
        const el = list.get(i);
        if (el && getId(el) === want) {
          from = i;
          break;
        }
      }
    }
    if (from >= 0 && from !== pos) list.move(from, pos);
  }
}

function applyReorderFromKeys(
  sectionsList: LiveList<LiveObject<PackingSectionStorage>>,
  itemsList: LiveList<LiveObject<PackingItemStorage>>,
  keys: readonly string[],
): void {
  const { sectionIds, placements } = parseKeyOrder(keys);
  if (placements.length !== itemsList.length) return;
  if (sectionIds.length !== sectionsList.length) return;
  const seen = new Set<string>();
  for (const p of placements) {
    if (seen.has(p.itemId)) return;
    seen.add(p.itemId);
  }
  const itemById = new Map<string, LiveObject<PackingItemStorage>>();
  for (let i = 0; i < itemsList.length; i++) {
    const row = itemsList.get(i);
    if (!row) continue;
    itemById.set(String(row.get("id")), row);
  }
  for (const p of placements) {
    const row = itemById.get(p.itemId);
    if (!row) return;
  }
  for (const p of placements) {
    const row = itemById.get(p.itemId)!;
    row.set("sectionId", p.sectionId);
  }
  reorderLiveListByIds(
    itemsList,
    placements.map((p) => p.itemId),
    (el) => String(el.get("id")),
  );
  reorderLiveListByIds(sectionsList, sectionIds, (el) => String(el.get("id")));
}

function buildSyncPayload(
  sectionsRead: readonly { id: string; title: string }[],
  itemsRead: readonly StorageRow[],
): PackingListSyncPayload {
  const validIds = new Set(sectionsRead.map((s) => s.id));
  const sectionIndex = new Map<string, number>();
  sectionsRead.forEach((s, i) => sectionIndex.set(s.id, i));

  const decorated = itemsRead.map((item, flatIndex) => ({
    item,
    flatIndex,
    rank: (() => {
      const sid = item.sectionId;
      if (
        sid == null ||
        typeof sid !== "string" ||
        sid.trim() === "" ||
        !validIds.has(sid)
      ) {
        return Number.MAX_SAFE_INTEGER;
      }
      return sectionIndex.get(sid) ?? Number.MAX_SAFE_INTEGER;
    })(),
  }));

  decorated.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.flatIndex - b.flatIndex;
  });

  return {
    sections: sectionsRead.map((s) => ({
      id: s.id,
      title: normalizeSectionTitleForPayload(s.title),
    })),
    items: decorated.map(({ item }) => ({
      id: item.id,
      sectionId: readPersistedSectionId(item, validIds),
      name: item.name,
      quantity: item.quantity,
      quantityMax: item.quantityMax ?? null,
      signUps: readSignUps(item).map((s) => ({
        id: s.id,
        quantity: s.quantity,
        displayName: s.displayName,
        email: s.email,
        userId: s.userId,
        packed: s.packed,
      })),
    })),
  };
}

type NeedsGroup = {
  sectionId: string | null;
  label: string;
  rows: Array<{ item: StorageRow; index: number }>;
};

function buildNeedsSignUpGroups(
  items: readonly StorageRow[],
  sections: readonly { id: string; title: string }[],
  validIds: Set<string>,
): NeedsGroup[] {
  const filtered = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      packingItemNeedsSignUps(
        item.quantity,
        item.quantityMax,
        readSignUps(item),
      ),
    );

  const byKey = new Map<
    string | null,
    Array<{ item: StorageRow; index: number }>
  >();

  for (const row of filtered) {
    const sid = readPersistedSectionId(row.item, validIds);
    let arr = byKey.get(sid);
    if (!arr) {
      arr = [];
      byKey.set(sid, arr);
    }
    arr.push(row);
  }

  const out: NeedsGroup[] = [];
  for (const sec of sections) {
    const rows = byKey.get(sec.id);
    if (rows?.length)
      out.push({
        sectionId: sec.id,
        label: sec.title,
        rows,
      });
    byKey.delete(sec.id);
  }
  const unc = byKey.get(null);
  if (unc?.length) {
    out.push({
      sectionId: null,
      label: "Uncategorized",
      rows: unc,
    });
  }
  return out;
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

type PackingSortableSectionHeaderProps = {
  sortId: string;
  colCount: number;
  label: string;
  trailing: ReactNode;
};

/**
 * Section headers stay in `SortableContext` as droppable targets for item DnD, but are never
 * draggable in the main table (FR-3 — use “Reorder sections” instead).
 */
function PackingSortableSectionHeader({
  sortId,
  colCount,
  label,
  trailing,
}: PackingSortableSectionHeaderProps) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
    disabled: true,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="bg-gray-200/90 dark:bg-gray-800"
    >
      <td
        colSpan={colCount}
        className="border border-gray-300 px-3 py-2 dark:border-gray-600"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
              {label}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {trailing}
          </div>
        </div>
      </td>
    </tr>
  );
}

type PackingEditSectionsModalRow = EditSectionRow;

type PackingSortableItemRowProps = {
  sortId: string;
  dragDisabled: boolean;
  colCount: number;
  item: StorageRow;
  index: number;
  authUser: AuthUser | null;
  guestDisplayName: string | null;
  canManageTemplate: boolean;
  editingNeededIndex: number | null;
  setEditingNeededIndex: (n: number | null) => void;
  emailDrafts: Record<string, string>;
  setEmailDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  updateName: (a: { index: number; name: string }) => void;
  updateQuantity: (a: { index: number; quantity: number | null }) => void;
  updateQuantityMax: (a: { index: number; quantityMax: number | null }) => void;
  setItemOptionalMode: (a: { index: number; optional: boolean }) => void;
  addMySignUp: (index: number) => void;
  addMemberSignUp: (a: { index: number; forUserId: string }) => void;
  removeSignUpIfAllowed: (a: { itemIndex: number; signUpId: string }) => void;
  signupMembers: readonly PackingSignupMemberOption[];
  updateSignUpQuantity: (a: {
    itemIndex: number;
    signUpId: string;
    quantity: number | null;
  }) => void;
  setSignUpEmail: (a: {
    itemIndex: number;
    signUpId: string;
    email: string | null;
  }) => void;
  setPendingRemoveIndex: (n: number | null) => void;
};

function PackingSortableItemRow(props: PackingSortableItemRowProps) {
  const {
    sortId,
    dragDisabled,
    colCount,
    item,
    index,
    authUser,
    guestDisplayName,
    canManageTemplate,
    editingNeededIndex,
    setEditingNeededIndex,
    emailDrafts,
    setEmailDrafts,
    updateName,
    updateQuantity,
    updateQuantityMax,
    setItemOptionalMode,
    addMySignUp,
    addMemberSignUp,
    removeSignUpIfAllowed,
    signupMembers,
    updateSignUpQuantity,
    setSignUpEmail,
    setPendingRemoveIndex,
  } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId, disabled: dragDisabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };

  const signUps = readSignUps(item);
  const qMin = item.quantity;
  const qMax =
    item.quantityMax != null && qMin != null && item.quantityMax >= qMin
      ? item.quantityMax
      : null;
  const cap = itemQuantityCap(qMin, qMax);
  const isOptionalItem = isOptionalPackingMin(qMin);
  const isRange = qMin != null && qMin > 0 && qMax != null && qMax > qMin;
  const sum = allocatedSum(signUps);
  const remCap = remainingUntilCap(cap, signUps);
  const remMin = remainingUntilMin(qMin, signUps);
  const mySu = findMySignUp(signUps, authUser, guestDisplayName);
  const canSignUpMore =
    authUser || guestDisplayName
      ? cap == null || (remCap != null && remCap >= 1)
      : false;

  const eligibleMembersToAdd = useMemo(() => {
    if (!authUser || signupMembers.length === 0) return [];
    return signupMembers.filter(
      (m) =>
        m.userId !== authUser.dbUserId &&
        !signUps.some((s) => s.userId === m.userId),
    );
  }, [authUser, signupMembers, signUps]);

  const cellBorder = "border border-gray-300 dark:border-gray-600 align-middle";

  const showDrag = colCount >= 7;

  return (
    <Fragment>
      <tr
        ref={setNodeRef}
        style={style}
        className="bg-white hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900/80"
      >
        {showDrag ? (
          <td className={`${cellBorder} w-10 p-0 text-center`}>
            {!dragDisabled ? (
              <button
                type="button"
                className="mx-auto flex cursor-grab touch-none items-center justify-center rounded border border-transparent px-1 py-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
                aria-label="Drag to reorder item"
                {...attributes}
                {...listeners}
              >
                ⣿
              </button>
            ) : (
              <span className="inline-block px-1 py-2 text-gray-300 dark:text-gray-600">
                —
              </span>
            )}
          </td>
        ) : null}
        <td className={`${cellBorder} p-0`}>
          <input
            type="text"
            readOnly={!canManageTemplate}
            value={item.name}
            onChange={(e) => updateName({ index, name: e.target.value })}
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
                        v === "" ? null : Math.max(1, parseInt(v, 10) || 0),
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
                          v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
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
                      item.quantity == null ? "" : (item.quantityMax ?? "")
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      updateQuantityMax({
                        index,
                        quantityMax:
                          v === "" ? null : Math.max(0, parseInt(v, 10) || 0),
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
                  {qMax != null && remCap === 0 && signUps.length > 0 && (
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
            <span>{signUps.length ? `${signUps.length} signed up` : "—"}</span>
          )}
        </td>
        <td className={`${cellBorder} px-2 py-1.5`}>
          <div className="flex flex-col gap-1.5">
            {!mySu ? (
              <button
                type="button"
                onClick={() => addMySignUp(index)}
                disabled={(!authUser && !guestDisplayName) || !canSignUpMore}
                className="w-full rounded border border-transparent bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Sign up to bring
              </button>
            ) : null}
            {eligibleMembersToAdd.length > 0 && canSignUpMore ? (
              <label className="block text-[0.65rem] leading-tight text-gray-600 dark:text-gray-400">
                <span className="sr-only">
                  Sign up an event member to bring this
                </span>
                <span className="mb-0.5 block font-medium text-gray-700 dark:text-gray-300">
                  Sign up a member
                </span>
                <select
                  key={`member-pick-${item.id}-${signUps.length}`}
                  defaultValue=""
                  className="mt-0.5 w-full max-w-full rounded border border-gray-300 bg-white p-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                  aria-label="Choose an event member to sign up for this item"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    addMemberSignUp({ index, forUserId: v });
                    e.target.value = "";
                  }}
                >
                  <option value="">Choose…</option>
                  {eligibleMembersToAdd.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </td>
        <td className={`${cellBorder} p-2 text-gray-600 dark:text-gray-400`}>
          {signUps.length === 0 ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <ul className="space-y-2 text-xs">
              {signUps.map((su) => {
                const mine = isMineSignUp(su, authUser, guestDisplayName);
                const linkedMember =
                  authUser &&
                  su.userId &&
                  signupMembers.some((m) => m.userId === su.userId);
                const showRemoveOtherMemberSignUp =
                  linkedMember &&
                  su.userId &&
                  authUser &&
                  su.userId !== authUser.dbUserId;
                const showRemoveSignUp = mine || showRemoveOtherMemberSignUp;
                const canEditQuantity =
                  mine ||
                  (Boolean(authUser) &&
                    Boolean(su.userId) &&
                    signupMembers.some((m) => m.userId === su.userId));
                return (
                  <li
                    key={su.id}
                    className="grid grid-cols-[minmax(0,1fr)_4rem_1.5rem] items-center gap-x-1"
                  >
                    <span
                      className={`min-w-0 truncate ${
                        mine
                          ? "font-medium text-blue-800 dark:text-blue-300"
                          : ""
                      }`}
                      title={`${su.displayName}${mine ? " (you)" : ""}`.trim()}
                    >
                      {su.displayName}
                      {mine ? " (you)" : ""}
                    </span>
                    <div className="flex justify-end tabular-nums">
                      {canEditQuantity ? (
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
                          className="w-full max-w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-center dark:border-gray-600 dark:bg-gray-950"
                          aria-label={
                            mine ? "How many you bring" : "How many they bring"
                          }
                        />
                      ) : (
                        <span className="block w-full max-w-16 text-right">
                          {su.quantity ?? "—"}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end">
                      {showRemoveSignUp ? (
                        <button
                          type="button"
                          className="shrink-0 text-sm font-semibold leading-none text-red-600 hover:underline dark:text-red-400"
                          aria-label="Remove"
                          onClick={() =>
                            removeSignUpIfAllowed({
                              itemIndex: index,
                              signUpId: su.id,
                            })
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
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
              className="inline-flex items-center justify-center text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              aria-label="Remove item"
              title="Remove item"
            >
              <TrashIcon className="size-4" />
            </button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>
      </tr>
      {mySu && !authUser && (
        <tr className="bg-gray-50 dark:bg-gray-900/60">
          <td
            colSpan={colCount}
            className="border border-gray-300 px-3 py-2 dark:border-gray-600"
          >
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Add your email (optional) so we can link this to your Rendecrew
              account if you sign up later.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                placeholder="you@example.com"
                value={emailDrafts[`${item.id}:${mySu.id}`] ?? mySu.email ?? ""}
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
                    emailDrafts[`${item.id}:${mySu.id}`] ?? mySu.email ?? "";
                  const trimmed = raw.trim();
                  setSignUpEmail({
                    itemIndex: index,
                    signUpId: mySu.id,
                    email: trimmed === "" ? null : trimmed.toLowerCase(),
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
}

export function PackingListEditor({
  roomId,
  authUser,
  guestDisplayName,
  canManageTemplate,
  packingSignupMembers = [],
  persistToDatabase = true,
}: {
  roomId: string;
  authUser: AuthUser | null;
  guestDisplayName: string | null;
  /** Event organizers may edit shared rows; everyone else only manages their own sign-ups. */
  canManageTemplate: boolean;
  /** When non-empty, signed-in viewers may sign up or remove other event members for items. */
  packingSignupMembers?: readonly PackingSignupMemberOption[];
  /**
   * When false, storage updates are not synced to Postgres (e.g. while another tab is visible).
   * Avoids repeated persist while Liveblocks still streams updates in the background.
   */
  persistToDatabase?: boolean;
}) {
  const ctxRef = useRef({
    authUser,
    guestDisplayName,
    signupMembers: packingSignupMembers,
  });
  ctxRef.current = {
    authUser,
    guestDisplayName,
    signupMembers: packingSignupMembers,
  };

  const room = useRoom();
  const storageSnap = useStorage((root) => ({
    items: root.items,
    sections: root.sections,
  }));
  const rawItems = storageSnap?.items;
  const rawSections = storageSnap?.sections;
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
    (payload: PackingListSyncPayload) => {
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

  const migrateStorageShape = useMutation(({ storage }) => {
    const items = storage.get("items");
    let sections = storage.get("sections") as
      | LiveList<LiveObject<PackingSectionStorage>>
      | undefined
      | null;
    if (!sections) {
      sections = new LiveList<LiveObject<PackingSectionStorage>>([]);
      storage.set("sections", sections);
    }

    const titleToId = new Map<string, string>();
    for (let i = 0; i < sections.length; i++) {
      const s = sections.get(i);
      if (!s) continue;
      const tid = String(s.get("id") ?? "");
      const title = normalizeSectionTitleForPayload(
        String(s.get("title") ?? ""),
      );
      if (title && tid) titleToId.set(title, tid);
    }

    const orderedNewTitles: string[] = [];
    const seenNew = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const row = items.get(i);
      if (!row) continue;
      const rawSid = row.get("sectionId") as string | null | undefined;
      const hasSid = typeof rawSid === "string" && rawSid.trim() !== "";
      if (hasSid) continue;
      const leg = normalizedLegacySectionField({
        id: "",
        section: row.get("section") as string | null | undefined,
        name: "",
        quantity: null,
      });
      if (!leg) continue;
      if (seenNew.has(leg)) continue;
      seenNew.add(leg);
      orderedNewTitles.push(leg);
    }

    for (const t of orderedNewTitles) {
      if (sections.length >= MAX_PACKING_SECTIONS) break;
      if (!titleToId.has(t)) {
        const id = crypto.randomUUID();
        titleToId.set(t, id);
        sections.push(
          new LiveObject<PackingSectionStorage>({
            id,
            title: t,
          }),
        );
      }
    }

    for (let i = 0; i < items.length; i++) {
      const row = items.get(i);
      if (!row) continue;
      const rawSid = row.get("sectionId") as string | null | undefined;
      const hasSid = typeof rawSid === "string" && rawSid.trim() !== "";
      if (hasSid) {
        row.set("section", null);
        continue;
      }
      const leg = normalizedLegacySectionField({
        id: "",
        section: row.get("section") as string | null | undefined,
        name: "",
        quantity: null,
      });
      if (leg) {
        const sid = titleToId.get(leg);
        row.set("sectionId", sid ?? null);
      } else {
        row.set("sectionId", null);
      }
      row.set("section", null);
    }
  }, []);

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
    migrateStorageShape();
    migrateLegacySignUps();
  }, [rawItems, migrateStorageShape, migrateLegacySignUps]);

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
    const sectionsPayload = (rawSections ?? []).map((s) => ({
      id: s.id,
      title: s.title,
    }));
    const payload = buildSyncPayload(sectionsPayload, rawItems as StorageRow[]);
    schedulePersist(payload);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [rawItems, rawSections, schedulePersist, persistToDatabase]);

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

  function lastIndexForSectionBucket(
    items: LiveList<LiveObject<PackingItemStorage>>,
    sectionId: string | null,
  ): number {
    let last = -1;
    for (let i = 0; i < items.length; i++) {
      const row = items.get(i);
      if (!row) continue;
      const sidRaw = row.get("sectionId") as string | null | undefined;
      const sid =
        typeof sidRaw === "string" && sidRaw.trim() !== "" ? sidRaw : null;
      if (sid === sectionId) last = i;
    }
    return last;
  }

  const [newItemName, setNewItemName] = useState("");
  const [newItemSection, setNewItemSection] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");

  function findSectionIdByTitle(
    sections: LiveList<LiveObject<PackingSectionStorage>>,
    title: string,
  ): string | null {
    const want = title.trim();
    if (want === "") return null;
    for (let i = 0; i < sections.length; i++) {
      const s = sections.get(i);
      if (!s) continue;
      const t = String(s.get("title") ?? "").trim();
      if (t === want) return String(s.get("id"));
    }
    return null;
  }

  const addItemFromTopForm = useMutation(
    (
      { storage },
      input: { name: string; sectionTitle: string; quantityRaw: string },
    ) => {
      const items = storage.get("items");
      const sections = storage.get("sections");

      const name = input.name.trim().slice(0, 200);
      if (name === "") return;

      const sectionTitle = input.sectionTitle.trim().slice(0, MAX_SECTION_LEN);
      let sectionId = findSectionIdByTitle(sections, sectionTitle);
      if (sectionTitle !== "" && !sectionId) {
        sectionId = crypto.randomUUID();
        sections.push(
          new LiveObject<PackingSectionStorage>({
            id: sectionId,
            title: sectionTitle,
          }),
        );
      }

      const qRaw = input.quantityRaw.trim();
      let quantity: number | null = null;
      if (qRaw !== "") {
        const n = parseInt(qRaw, 10);
        quantity = Number.isFinite(n) && n > 0 ? n : null;
      }

      const signUps = new LiveList<LiveObject<PackingSignUpStorage>>([]);
      const insertAt = lastIndexForSectionBucket(items, sectionId) + 1;
      items.insert(
        new LiveObject<PackingItemStorage>({
          id: crypto.randomUUID(),
          sectionId,
          name,
          quantity,
          quantityMax: null,
          signUps,
        }),
        insertAt,
      );
    },
    [],
  );

  const applyCompositeReorder = useMutation(({ storage }, keys: string[]) => {
    const sectionsList = storage.get("sections");
    const itemsList = storage.get("items");
    applyReorderFromKeys(sectionsList, itemsList, keys);
  }, []);

  const applySectionEdits = useMutation(
    ({ storage }, nextRows: PackingEditSectionsModalRow[]) => {
      const items = storage.get("items");
      const sections = storage.get("sections");

      const cleaned = nextRows
        .map((r) => ({ id: String(r.id), title: String(r.title).trim() }))
        .filter((r) => r.title !== "");

      if (cleaned.length > MAX_PACKING_SECTIONS) return;

      const nextIdSet = new Set(cleaned.map((r) => r.id));
      const deletedIds = new Set<string>();
      for (let i = 0; i < sections.length; i++) {
        const s = sections.get(i);
        if (!s) continue;
        const id = String(s.get("id"));
        if (!nextIdSet.has(id)) deletedIds.add(id);
      }

      if (deletedIds.size > 0) {
        for (let i = 0; i < items.length; i++) {
          const row = items.get(i);
          if (!row) continue;
          const sid = row.get("sectionId");
          if (sid != null && deletedIds.has(String(sid))) {
            row.set("sectionId", null);
          }
        }
      }

      while (sections.length > 0) sections.delete(0);
      for (const r of cleaned) {
        sections.push(
          new LiveObject<PackingSectionStorage>({
            id: r.id,
            title: r.title.slice(0, MAX_SECTION_LEN),
          }),
        );
      }

      const keys = buildCompositeKeys(
        snapshotSectionIds(sections),
        snapshotItemMeta(items),
      );
      applyReorderFromKeys(sections, items, keys);
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

  const addMemberSignUp = useMutation(
    (
      { storage },
      { index, forUserId }: { index: number; forUserId: string },
    ) => {
      const { authUser: au, signupMembers: members } = ctxRef.current;
      if (!au) return;
      const member = members.find((m) => m.userId === forUserId);
      if (!member || member.userId === au.dbUserId) return;
      const items = storage.get("items");
      const row = items.get(index);
      if (!row) return;
      let signUps = row.get("signUps");
      if (!signUps) {
        const list = new LiveList<LiveObject<PackingSignUpStorage>>([]);
        row.set("signUps", list as never);
        signUps = list as never;
      }
      for (let i = 0; i < signUps.length; i++) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("userId") === forUserId) return;
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
          displayName: member.name,
          email: null,
          userId: member.userId,
          packed: false,
        }),
      );
    },
    [],
  );

  const removeSignUpIfAllowed = useMutation(
    (
      { storage },
      { itemIndex, signUpId }: { itemIndex: number; signUpId: string },
    ) => {
      const {
        authUser: au,
        guestDisplayName: gn,
        signupMembers: members,
      } = ctxRef.current;
      const items = storage.get("items");
      const row = items.get(itemIndex);
      if (!row) return;
      const signUps = row.get("signUps");
      if (!signUps) return;
      const g = gn?.trim() ?? null;
      for (let i = signUps.length - 1; i >= 0; i--) {
        const s = signUps.get(i);
        if (!s) continue;
        if (s.get("id") !== signUpId) continue;
        const uid = (s.get("userId") as string | null) ?? null;
        if (au) {
          const roster = new Set(members.map((m) => m.userId));
          const mine = uid === au.dbUserId;
          const removable = mine || (!!uid && roster.has(uid));
          if (!removable) return;
        } else {
          if (!g || uid) return;
          if (String(s.get("displayName") ?? "") !== g) return;
        }
        signUps.delete(i);
        return;
      }
    },
    [],
  );

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

      const {
        authUser: au,
        guestDisplayName: gn,
        signupMembers: members,
      } = ctxRef.current;
      const rowSignUp: StorageSignUp = {
        id: String(target.get("id")),
        quantity: (target.get("quantity") as number | null) ?? null,
        displayName: String(target.get("displayName") ?? ""),
        email: (target.get("email") as string | null) ?? null,
        userId: (target.get("userId") as string | null) ?? null,
        packed: Boolean(target.get("packed")),
      };
      const mine = isMineSignUp(rowSignUp, au, gn);
      const uid = rowSignUp.userId?.trim() ?? null;
      const canEditOtherMemberQty =
        Boolean(au) && Boolean(uid) && members.some((m) => m.userId === uid);
      if (!mine && !canEditOtherMemberQty) return;

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

  const [editSectionsOpen, setEditSectionsOpen] = useState(false);
  const [editSectionsDraft, setEditSectionsDraft] = useState<
    PackingEditSectionsModalRow[]
  >([]);

  useEffect(() => {
    if (!editSectionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEditSectionsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editSectionsOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items = useMemo(() => (rawItems ?? []) as StorageRow[], [rawItems]);
  const sectionsOrdered = useMemo(
    () => rawSections?.map((s) => ({ id: s.id, title: s.title })) ?? [],
    [rawSections],
  );
  const sectionIdSet = useMemo(
    () => new Set(sectionsOrdered.map((s) => s.id)),
    [sectionsOrdered],
  );

  const openEditSectionsDialog = useCallback(() => {
    setEditSectionsDraft(
      sectionsOrdered.map((s) => ({ id: s.id, title: s.title })),
    );
    setEditSectionsOpen(true);
  }, [sectionsOrdered]);

  const orderedKeys = useMemo(() => {
    if (!rawItems) return [] as string[];
    const secs = rawSections ?? [];
    const metas: ItemMeta[] = rawItems.map((row) => ({
      id: row.id,
      sectionId: readPersistedSectionId(row as StorageRow, sectionIdSet),
    }));
    return buildCompositeKeys(
      secs.map((s) => s.id),
      metas,
    );
  }, [rawItems, rawSections, sectionIdSet]);

  const indexByItemId = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, i) => m.set(it.id, i));
    return m;
  }, [items]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canManageTemplate || listView !== "all") return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const a = String(active.id);
      if (!a.startsWith("i:")) return;
      const o = String(over.id);
      const oldIndex = orderedKeys.indexOf(a);
      const newIndex = orderedKeys.indexOf(o);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextKeys = arrayMove(orderedKeys, oldIndex, newIndex);
      room.batch(() => {
        applyCompositeReorder(nextKeys);
      });
    },
    [applyCompositeReorder, canManageTemplate, listView, orderedKeys, room],
  );

  const needsGroups = useMemo(
    () => buildNeedsSignUpGroups(items, sectionsOrdered, sectionIdSet),
    [items, sectionsOrdered, sectionIdSet],
  );

  const needsKeys = useMemo(() => {
    const k: string[] = [];
    for (const g of needsGroups) {
      if (g.sectionId != null) k.push(`s:${g.sectionId}`);
      else k.push(`s:${UNCATEGORIZED_SENTINEL}`);
      for (const r of g.rows) k.push(`i:${r.item.id}`);
    }
    return k;
  }, [needsGroups]);

  const sortKeys = listView === "all" ? orderedKeys : needsKeys;
  const dragDisabled = !canManageTemplate || listView !== "all";

  const colCount = canManageTemplate ? 7 : 6;

  if (rawItems === undefined || rawItems === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">Connecting…</p>
    );
  }

  const titleBySectionId = new Map(
    sectionsOrdered.map((s) => [s.id, s.title] as const),
  );

  return (
    <div className="space-y-4">
      {saveError && !editSectionsOpen ? (
        <div className="text-sm text-red-600 dark:text-red-400" role="alert">
          {saveError}
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Undo and redo your recent edits"
      >
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 15l-6-6 6-6" />
            <path d="M3 9h12a6 6 0 1 1 0 12h-3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 15l6-6-6-6" />
            <path d="M21 9H9a6 6 0 1 0 0 12h3" />
          </svg>
        </button>
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

      {canManageTemplate ? (
        <section className="rounded-lg border border-gray-300 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-950">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addItemFromTopForm({
                name: newItemName,
                sectionTitle: newItemSection,
                quantityRaw: newItemQty,
              });
              setNewItemName("");
              setNewItemSection("");
              setNewItemQty("1");
            }}
          >
            <div className="min-w-56 flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Item
              </label>
              <input
                required
                maxLength={200}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Add group item"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Section
              </label>
              <input
                maxLength={MAX_SECTION_LEN}
                value={newItemSection}
                onChange={(e) => setNewItemSection(e.target.value)}
                placeholder="Section"
                list="packing-group-section-options"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
              <datalist id="packing-group-section-options">
                {sectionsOrdered.map((s) => (
                  <option key={s.id} value={s.title} />
                ))}
              </datalist>
            </div>
            <div className="w-28">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Qty
              </label>
              <input
                type="number"
                min={1}
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Add
            </button>
          </form>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-950">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={packingListDndAccessibility}
          onDragEnd={onDragEnd}
        >
          <table className="w-full min-w-[940px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-900">
                {canManageTemplate ? (
                  <th
                    scope="col"
                    className="w-10 border border-gray-300 p-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300"
                  >
                    <span className="sr-only">Reorder rows</span>
                  </th>
                ) : null}
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
            <SortableContext
              items={sortKeys}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {listView === "needsSignUps" &&
                needsGroups.length === 0 &&
                items.length > 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="border border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400"
                    >
                      Every item is covered — nothing is waiting for sign-ups.
                    </td>
                  </tr>
                ) : null}
                {listView === "all"
                  ? orderedKeys.map((key) => {
                      if (key.startsWith("s:")) {
                        const sid = key.slice(2);
                        if (sid === UNCATEGORIZED_SENTINEL) {
                          return (
                            <PackingSortableSectionHeader
                              key={key}
                              sortId={key}
                              colCount={colCount}
                              label="Uncategorized"
                              trailing={null}
                            />
                          );
                        }
                        const secTitle = titleBySectionId.get(sid) ?? "Section";
                        return (
                          <PackingSortableSectionHeader
                            key={key}
                            sortId={key}
                            colCount={colCount}
                            label={secTitle}
                            trailing={null}
                          />
                        );
                      }
                      const itemId = key.slice(2);
                      const index = indexByItemId.get(itemId);
                      if (index == null) return null;
                      const item = items[index]!;
                      return (
                        <PackingSortableItemRow
                          key={key}
                          sortId={key}
                          dragDisabled={dragDisabled}
                          colCount={colCount}
                          item={item}
                          index={index}
                          authUser={authUser}
                          guestDisplayName={guestDisplayName}
                          canManageTemplate={canManageTemplate}
                          editingNeededIndex={editingNeededIndex}
                          setEditingNeededIndex={setEditingNeededIndex}
                          emailDrafts={emailDrafts}
                          setEmailDrafts={setEmailDrafts}
                          updateName={updateName}
                          updateQuantity={updateQuantity}
                          updateQuantityMax={updateQuantityMax}
                          setItemOptionalMode={setItemOptionalMode}
                          addMySignUp={addMySignUp}
                          addMemberSignUp={addMemberSignUp}
                          removeSignUpIfAllowed={removeSignUpIfAllowed}
                          signupMembers={packingSignupMembers}
                          updateSignUpQuantity={updateSignUpQuantity}
                          setSignUpEmail={setSignUpEmail}
                          setPendingRemoveIndex={setPendingRemoveIndex}
                        />
                      );
                    })
                  : needsGroups.flatMap((g) => {
                      const hid =
                        g.sectionId != null
                          ? `s:${g.sectionId}`
                          : `s:${UNCATEGORIZED_SENTINEL}`;
                      const headerTitle =
                        g.sectionId != null ? g.label : "Uncategorized";
                      const header = (
                        <PackingSortableSectionHeader
                          key={hid}
                          sortId={hid}
                          colCount={colCount}
                          label={headerTitle}
                          trailing={null}
                        />
                      );
                      const rows = g.rows.map(({ item, index }) => (
                        <PackingSortableItemRow
                          key={`i:${item.id}`}
                          sortId={`i:${item.id}`}
                          dragDisabled={dragDisabled}
                          colCount={colCount}
                          item={item}
                          index={index}
                          authUser={authUser}
                          guestDisplayName={guestDisplayName}
                          canManageTemplate={canManageTemplate}
                          editingNeededIndex={editingNeededIndex}
                          setEditingNeededIndex={setEditingNeededIndex}
                          emailDrafts={emailDrafts}
                          setEmailDrafts={setEmailDrafts}
                          updateName={updateName}
                          updateQuantity={updateQuantity}
                          updateQuantityMax={updateQuantityMax}
                          setItemOptionalMode={setItemOptionalMode}
                          addMySignUp={addMySignUp}
                          addMemberSignUp={addMemberSignUp}
                          removeSignUpIfAllowed={removeSignUpIfAllowed}
                          signupMembers={packingSignupMembers}
                          updateSignUpQuantity={updateSignUpQuantity}
                          setSignUpEmail={setSignUpEmail}
                          setPendingRemoveIndex={setPendingRemoveIndex}
                        />
                      ));
                      return [header, ...rows];
                    })}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      {canManageTemplate ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            onClick={openEditSectionsDialog}
          >
            Edit sections
          </button>
        </div>
      ) : null}

      {editSectionsOpen && canManageTemplate ? (
        <EditSectionsModal
          titleId="packing-edit-sections-title"
          rows={editSectionsDraft}
          setRows={setEditSectionsDraft}
          maxTitleLength={MAX_SECTION_LEN}
          inlineError={saveError}
          onCancel={() => setEditSectionsOpen(false)}
          onDone={() => {
            room.batch(() => {
              applySectionEdits(editSectionsDraft);
            });
            setEditSectionsOpen(false);
          }}
        />
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

export function buildInitialStorage({
  sections,
  items,
}: {
  sections: PackingSectionPayload[];
  items: PackingItemPayload[];
}): {
  sections: LiveList<LiveObject<PackingSectionStorage>>;
  items: LiveList<LiveObject<PackingItemStorage>>;
} {
  return {
    sections: new LiveList(
      sections.map(
        (s) =>
          new LiveObject({
            id: s.id,
            title: s.title,
          }),
      ),
    ),
    items: new LiveList(
      items.map(
        (i) =>
          new LiveObject({
            id: i.id,
            sectionId: i.sectionId,
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
  } as {
    sections: LiveList<LiveObject<PackingSectionStorage>>;
    items: LiveList<LiveObject<PackingItemStorage>>;
  };
}
