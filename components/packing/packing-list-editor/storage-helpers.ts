import { LiveList, LiveObject } from "@liveblocks/client";
import type { PackingListSyncPayload } from "@/lib/packing-list";
import { packingItemNeedsSignUps } from "@/lib/packing-quantity";
import type {
  PackingItemStorage,
  PackingSectionStorage,
  PackingSignUpStorage,
} from "@/liveblocks.config";
import { UNCATEGORIZED_SENTINEL } from "./constants";
import { snapshotSignUps } from "./snapshot-sign-ups";
import type {
  AuthUser,
  ItemMeta,
  NeedsGroup,
  ParsedKeyOrder,
  StorageRow,
  StorageSignUp,
} from "./types";

export function normalizedLegacySectionField(row: StorageRow): string | null {
  const s = row.section;
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

export function normalizeSectionTitleForPayload(title: string): string {
  return title.trim();
}

export function readPersistedSectionId(
  row: StorageRow,
  validSectionIds: Set<string>,
): string | null {
  const raw = row.sectionId;
  if (raw == null || typeof raw !== "string" || raw.trim() === "") return null;
  return validSectionIds.has(raw) ? raw : null;
}

export function snapshotItemMeta(
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

export function snapshotSectionIds(
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

export function buildCompositeKeys(
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

export function parseKeyOrder(keys: readonly string[]): ParsedKeyOrder {
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

export function reorderLiveListByIds<T extends LiveObject<{ id: string }>>(
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

export function applyReorderFromKeys(
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

export function buildSyncPayload(
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

export function buildNeedsSignUpGroups(
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

export function readSignUps(row: StorageRow): StorageSignUp[] {
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

export function allocatedSum(signUps: StorageSignUp[]): number {
  return signUps.reduce((a, s) => a + (s.quantity ?? 0), 0);
}

export function remainingUntilCap(
  cap: number | null,
  signUps: StorageSignUp[],
): number | null {
  if (cap == null) return null;
  return Math.max(0, cap - allocatedSum(signUps));
}

export function remainingUntilMin(
  min: number | null,
  signUps: StorageSignUp[],
): number | null {
  if (min == null) return null;
  return Math.max(0, min - allocatedSum(signUps));
}

/** Clamp total sign-ups to cap by trimming from the end of the list. */
export function clampSignUpsOverCap(
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

export function isMineSignUp(
  su: StorageSignUp,
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): boolean {
  if (authUser) return su.userId === authUser.dbUserId;
  if (guestDisplayName)
    return !su.userId && su.displayName === guestDisplayName;
  return false;
}

export function findMySignUp(
  signUps: StorageSignUp[],
  authUser: AuthUser | null,
  guestDisplayName: string | null,
): StorageSignUp | null {
  return (
    signUps.find((s) => isMineSignUp(s, authUser, guestDisplayName)) ?? null
  );
}

/** Maps UI / mutation desired quantity into a capped sign-up row quantity, or null if none left. */
export function resolvedNewSignUpQuantity(
  desiredQty: number | undefined,
  rem: number | null,
): number | null {
  const raw =
    typeof desiredQty === "number" &&
    Number.isFinite(desiredQty) &&
    desiredQty >= 1
      ? Math.floor(desiredQty)
      : 1;
  const q = rem != null ? Math.min(raw, rem) : raw;
  return q >= 1 ? q : null;
}
