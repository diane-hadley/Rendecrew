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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { syncPackingListToDatabase } from "@/app/actions/packing-list";
import type { PackingListSyncPayload } from "@/lib/packing-list";
import { itemQuantityCap } from "@/lib/packing-quantity";
import type {
  PackingItemStorage,
  PackingSectionStorage,
  PackingSignUpStorage,
} from "@/liveblocks.config";
import { EditSectionsModal, type EditSectionRow } from "../EditSectionsModal";
import {
  MAX_PACKING_SECTIONS,
  MAX_SECTION_LEN,
  PACKING_VIEW_TOGGLE_BTN_PAD,
  PACKING_VIEW_TOGGLE_DIVIDER,
  PACKING_VIEW_TOGGLE_SELECTED,
  PACKING_VIEW_TOGGLE_SHELL,
  PACKING_VIEW_TOGGLE_UNSELECTED,
  packingListDndAccessibility,
  UNCATEGORIZED_SENTINEL,
} from "./constants";
import { PackingSortableItemRow } from "./PackingSortableItemRow";
import { PackingSortableSectionHeader } from "./PackingSortableSectionHeader";
import {
  applyReorderFromKeys,
  buildCompositeKeys,
  buildNeedsSignUpGroups,
  buildSyncPayload,
  clampSignUpsOverCap,
  isMineSignUp,
  normalizeSectionTitleForPayload,
  normalizedLegacySectionField,
  readPersistedSectionId,
  resolvedNewSignUpQuantity,
  snapshotItemMeta,
  snapshotSectionIds,
} from "./storage-helpers";
import type { AuthUser, PackingSignupMemberOption, StorageRow } from "./types";

type PackingEditSectionsModalRow = EditSectionRow;

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

  const updateSectionTitle = useMutation(
    (
      { storage },
      { sectionId, title }: { sectionId: string; title: string },
    ) => {
      const sections = storage.get("sections");
      const next = title.trim().slice(0, MAX_SECTION_LEN);
      if (!next) return;
      for (let i = 0; i < sections.length; i++) {
        const s = sections.get(i);
        if (!s) continue;
        if (String(s.get("id")) !== sectionId) continue;
        s.set("title", next);
        return;
      }
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

  const addMySignUp = useMutation(
    (
      { storage },
      { index, quantity: desiredQty }: { index: number; quantity?: number },
    ) => {
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

      const newQuantity = resolvedNewSignUpQuantity(desiredQty, rem);
      if (newQuantity == null) return;

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
    },
    [],
  );

  const addMemberSignUp = useMutation(
    (
      { storage },
      {
        index,
        forUserId,
        quantity: desiredQty,
      }: { index: number; forUserId: string; quantity?: number },
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

      const newQuantity = resolvedNewSignUpQuantity(desiredQty, rem);
      if (newQuantity == null) return;

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

  const commitSectionTitle = useCallback(
    (sectionId: string, raw: string, previousTitle: string): boolean => {
      const t = raw.trim().slice(0, MAX_SECTION_LEN);
      if (t === previousTitle.trim()) return true;
      if (!t) {
        setSaveError("Section name cannot be empty.");
        return false;
      }
      const dup = sectionsOrdered.some(
        (s) => s.id !== sectionId && s.title.trim() === t,
      );
      if (dup) {
        setSaveError("A section with that name already exists.");
        return false;
      }
      setSaveError(null);
      updateSectionTitle({ sectionId, title: t });
      return true;
    },
    [sectionsOrdered, updateSectionTitle],
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

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Packing list view"
      >
        <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
        <div className={PACKING_VIEW_TOGGLE_SHELL}>
          <button
            type="button"
            aria-pressed={listView === "all"}
            onClick={() => setListView("all")}
            className={`${PACKING_VIEW_TOGGLE_BTN_PAD} ${
              listView === "all"
                ? PACKING_VIEW_TOGGLE_SELECTED
                : PACKING_VIEW_TOGGLE_UNSELECTED
            }`}
          >
            All items
          </button>
          <button
            type="button"
            aria-pressed={listView === "needsSignUps"}
            onClick={() => setListView("needsSignUps")}
            className={`${PACKING_VIEW_TOGGLE_DIVIDER} ${PACKING_VIEW_TOGGLE_BTN_PAD} ${
              listView === "needsSignUps"
                ? PACKING_VIEW_TOGGLE_SELECTED
                : PACKING_VIEW_TOGGLE_UNSELECTED
            }`}
          >
            Needs sign-ups
          </button>
        </div>
      </div>

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
                            canEditTitle={canManageTemplate}
                            onCommitSectionTitle={commitSectionTitle}
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
                          canEditTitle={canManageTemplate}
                          onCommitSectionTitle={commitSectionTitle}
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
