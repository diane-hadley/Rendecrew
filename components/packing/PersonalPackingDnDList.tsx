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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FocusEvent,
} from "react";
import {
  deletePersonalPackingItem,
  reorderPersonalPackingItems,
  updatePersonalPackingItem,
} from "@/app/actions/packing-advanced";
import {
  applyPersonalPackingDrag,
  buildPersonalPackingSortKeys,
  buildPersonalPackingSortKeysAfterSectionReorder,
  parsePersonalPackingSortKeys,
  sectionSortIdToSectionKey,
} from "@/lib/personal-packing-sort-keys";
import {
  buildPersonalItemSectionGroups,
  storageKeyForPersonalSection,
  type PersonalItemVM,
} from "@/lib/personal-packing-sections";
import { PersonalPackingEditSectionsModal } from "./PersonalPackingReorderSectionsModal";

const MAX_PERSONAL_SECTION_TITLE_LEN = 120;

/** Section bars stay in SortableContext for item drops but are not draggable (same as Group Packing). */
function PersonalSectionHeaderRow({
  id,
  label,
  sectionKey,
  pending,
  onServerError,
  onRenameSection,
}: {
  id: string;
  label: string;
  /** Storage key; empty string means Uncategorized (not editable as a name). */
  sectionKey: string;
  pending: boolean;
  onServerError: (message: string) => void;
  onRenameSection: (sectionKey: string, nextTitle: string) => void;
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: true,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  const editable = sectionKey !== "";

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (!editable) return;
    const el = e.currentTarget;
    const trimmed = el.value.trim().slice(0, MAX_PERSONAL_SECTION_TITLE_LEN);
    if (trimmed === sectionKey) {
      el.value = sectionKey;
      return;
    }
    if (!trimmed) {
      el.value = sectionKey;
      onServerError("Section name cannot be empty.");
      return;
    }
    onRenameSection(sectionKey, trimmed);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded border border-gray-200 bg-gray-200/90 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
    >
      {editable ? (
        <input
          type="text"
          key={id}
          defaultValue={sectionKey}
          maxLength={MAX_PERSONAL_SECTION_TITLE_LEN}
          disabled={pending}
          onBlur={handleBlur}
          aria-label="Section name"
          className="w-full min-w-0 border-0 bg-transparent p-0 text-xs font-semibold uppercase tracking-wide text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100 dark:focus:ring-blue-400"
        />
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
          {label}
        </span>
      )}
    </div>
  );
}

function SortableItemRow({
  id,
  item,
  pending,
  onQuantityBlur,
  onDelete,
  onPackedChange,
  onServerError,
  onNameSaveSuccess,
  disabled,
}: {
  id: string;
  item: PersonalItemVM;
  pending: boolean;
  onQuantityBlur: (n: number) => void;
  onDelete: () => void;
  onPackedChange: (checked: boolean) => void;
  onServerError: (message: string) => void;
  onNameSaveSuccess: () => void;
  disabled?: boolean;
}) {
  const [nameSavePending, startNameSave] = useTransition();
  const rowBusy = pending || nameSavePending;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  const handleNameBlur = (e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const trimmed = el.value.trim();
    if (trimmed === item.name) {
      el.value = item.name;
      return;
    }
    if (!trimmed) {
      el.value = item.name;
      onServerError("Item name cannot be empty.");
      return;
    }
    startNameSave(async () => {
      const r = await updatePersonalPackingItem(item.id, { name: trimmed });
      if (!r.ok) {
        onServerError(r.error);
        el.value = item.name;
        return;
      }
      onNameSaveSuccess();
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        aria-label={`Drag to reorder ${item.name}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden className="text-xs">
          ⋮⋮
        </span>
      </button>
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
        <input
          type="checkbox"
          checked={item.packed}
          disabled={rowBusy || disabled}
          onChange={(e) => onPackedChange(e.target.checked)}
          aria-label={`Packed: ${item.name}`}
          className="shrink-0 rounded border-gray-300 dark:border-gray-600"
        />
        <input
          type="text"
          defaultValue={item.name}
          key={`${item.id}:${item.name}`}
          disabled={rowBusy}
          onBlur={handleNameBlur}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
          aria-label="Item name"
        />
      </div>
      <input
        type="number"
        min={1}
        defaultValue={item.quantity}
        key={item.id + String(item.quantity)}
        className="w-16 rounded border border-gray-300 px-1 py-0.5 text-center dark:border-gray-600 dark:bg-gray-950"
        onBlur={(e) => {
          const n = Math.max(1, parseInt(e.target.value, 10) || 1);
          onQuantityBlur(n);
        }}
        disabled={rowBusy}
        aria-label="Quantity"
      />
      <button
        type="button"
        className="ml-auto text-xs text-red-600 hover:underline dark:text-red-400"
        onClick={onDelete}
        disabled={rowBusy}
      >
        Delete
      </button>
    </div>
  );
}

export function PersonalPackingDnDList({
  eventId,
  personalItems,
  sharedSectionTitles,
  onServerError,
}: {
  eventId: string;
  personalItems: PersonalItemVM[];
  sharedSectionTitles: readonly string[];
  onServerError: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const groups = useMemo(
    () => buildPersonalItemSectionGroups(personalItems, sharedSectionTitles),
    [personalItems, sharedSectionTitles],
  );
  const serverKeys = useMemo(
    () => buildPersonalPackingSortKeys(groups),
    [groups],
  );
  const namedSectionKeys = useMemo(
    () => groups.filter((g) => g.sectionKey !== "").map((g) => g.sectionKey),
    [groups],
  );
  const itemById = useMemo(() => {
    const m = new Map<string, PersonalItemVM>();
    for (const it of personalItems) m.set(it.id, it);
    return m;
  }, [personalItems]);

  const [localKeys, setLocalKeys] = useState<string[] | null>(null);
  const sortKeys = localKeys ?? serverKeys;

  const [editSectionsOpen, setEditSectionsOpen] = useState(false);
  const editSectionsOpenRef = useRef(editSectionsOpen);
  editSectionsOpenRef.current = editSectionsOpen;
  const [editSectionsError, setEditSectionsError] = useState<string | null>(
    null,
  );
  const [editSectionsDraft, setEditSectionsDraft] = useState<
    { id: string; title: string }[]
  >([]);

  const reportReorderError = useCallback(
    (message: string) => {
      if (editSectionsOpenRef.current) setEditSectionsError(message);
      else onServerError(message);
    },
    [onServerError],
  );

  const serverSig = useMemo(
    () =>
      personalItems
        .map((it) => `${it.id}:${it.section}:${it.sortOrder}:${it.name}`)
        .join("|"),
    [personalItems],
  );

  useEffect(() => {
    setLocalKeys(null);
  }, [serverSig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const applyReorderAndPersist = (
    nextKeys: string[],
    opts?: { onReorderSuccess?: () => void },
  ) => {
    const ordered = parsePersonalPackingSortKeys(nextKeys);
    if (ordered.length !== personalItems.length) {
      setLocalKeys(null);
      reportReorderError("Could not save order");
      return;
    }
    setLocalKeys(nextKeys);
    startTransition(async () => {
      const r = await reorderPersonalPackingItems(eventId, ordered);
      if (!r.ok) {
        setLocalKeys(null);
        reportReorderError(r.error);
        return;
      }
      opts?.onReorderSuccess?.();
      router.refresh();
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (pending) return;
    const { active, over } = event;
    if (!over || active.id == null || over.id == null) return;
    const next = applyPersonalPackingDrag(
      sortKeys,
      String(active.id),
      String(over.id),
    );
    if (!next) return;
    applyReorderAndPersist(next);
  };

  const applySectionEditsFromModal = () => {
    setEditSectionsError(null);
    const rows = editSectionsDraft
      .map((r) => ({ id: r.id, title: r.title.trim() }))
      .filter((r) => r.title !== "");

    const renameByOldTitle = new Map<string, string>();
    const deletedOldTitles = new Set<string>();

    for (const k of namedSectionKeys) deletedOldTitles.add(k);
    for (const r of rows) {
      const isExisting = namedSectionKeys.includes(r.id);
      if (!isExisting) continue;
      deletedOldTitles.delete(r.id);
      if (r.title !== r.id) renameByOldTitle.set(r.id, r.title);
    }

    const nextOrderTitles = (() => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.title)) continue;
        seen.add(r.title);
        out.push(r.title);
      }
      return out;
    })();

    const itemsNext = personalItems.map((it) => {
      const k = storageKeyForPersonalSection(it.section);
      if (k !== "" && deletedOldTitles.has(k)) return { ...it, section: null };
      const renamed = k !== "" ? renameByOldTitle.get(k) : undefined;
      if (renamed) return { ...it, section: renamed };
      return it;
    });

    const orderWithItems = nextOrderTitles.filter((t) =>
      itemsNext.some((it) => storageKeyForPersonalSection(it.section) === t),
    );
    const nextKeys = buildPersonalPackingSortKeysAfterSectionReorder(
      orderWithItems,
      itemsNext,
    );

    // Validate and persist.
    const parsed = parsePersonalPackingSortKeys(nextKeys);
    if (parsed.length !== personalItems.length) {
      reportReorderError("Could not save order");
      return;
    }
    applyReorderAndPersist(nextKeys, {
      onReorderSuccess: () => {
        setEditSectionsError(null);
        setEditSectionsOpen(false);
      },
    });
  };

  const applyPersonalSectionRename = (
    oldSectionKey: string,
    rawNext: string,
  ) => {
    const next = rawNext.trim().slice(0, MAX_PERSONAL_SECTION_TITLE_LEN);
    if (!next) {
      onServerError("Section name cannot be empty.");
      return;
    }
    if (next === oldSectionKey) return;
    if (namedSectionKeys.some((k) => k !== oldSectionKey && k === next)) {
      onServerError("A section with that name already exists.");
      return;
    }

    const itemsNext = personalItems.map((it) =>
      storageKeyForPersonalSection(it.section) === oldSectionKey
        ? { ...it, section: next }
        : it,
    );

    const nextOrderTitles = namedSectionKeys.map((k) =>
      k === oldSectionKey ? next : k,
    );

    const orderWithItems = nextOrderTitles.filter((t) =>
      itemsNext.some((it) => storageKeyForPersonalSection(it.section) === t),
    );

    const nextKeys = buildPersonalPackingSortKeysAfterSectionReorder(
      orderWithItems,
      itemsNext,
    );

    const parsed = parsePersonalPackingSortKeys(nextKeys);
    if (parsed.length !== personalItems.length) {
      reportReorderError("Could not save section name.");
      return;
    }
    applyReorderAndPersist(nextKeys);
  };

  if (personalItems.length === 0) {
    return <p className="mt-3 text-gray-500">No personal rows yet.</p>;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortKeys}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-3 space-y-2">
            {sortKeys.map((key) => {
              if (key == null || typeof key !== "string") return null;
              if (key.startsWith("s:")) {
                const body = key.slice(2);
                const sectionKey = sectionSortIdToSectionKey(body);
                const label = sectionKey === "" ? "Uncategorized" : sectionKey;
                return (
                  <PersonalSectionHeaderRow
                    key={key}
                    id={key}
                    label={label}
                    sectionKey={sectionKey}
                    pending={pending}
                    onServerError={onServerError}
                    onRenameSection={applyPersonalSectionRename}
                  />
                );
              }
              const itemId = key.slice(2);
              const item = itemById.get(itemId);
              if (!item) return null;
              return (
                <SortableItemRow
                  key={key}
                  id={key}
                  item={item}
                  pending={pending}
                  disabled={pending}
                  onServerError={onServerError}
                  onNameSaveSuccess={() => router.refresh()}
                  onPackedChange={(packed) => {
                    startTransition(async () => {
                      await updatePersonalPackingItem(item.id, { packed });
                      router.refresh();
                    });
                  }}
                  onQuantityBlur={(n) => {
                    if (n === item.quantity) return;
                    startTransition(async () => {
                      await updatePersonalPackingItem(item.id, { quantity: n });
                      router.refresh();
                    });
                  }}
                  onDelete={() => {
                    startTransition(async () => {
                      await deletePersonalPackingItem(item.id);
                      router.refresh();
                    });
                  }}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditSectionsError(null);
            setEditSectionsDraft(
              namedSectionKeys.map((k) => ({ id: k, title: k })),
            );
            setEditSectionsOpen(true);
          }}
          className="rounded-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Edit sections
        </button>
      </div>

      {editSectionsOpen ? (
        <PersonalPackingEditSectionsModal
          rows={editSectionsDraft}
          setRows={setEditSectionsDraft}
          inlineError={editSectionsError}
          onCancel={() => {
            setEditSectionsError(null);
            setEditSectionsOpen(false);
          }}
          onDone={applySectionEditsFromModal}
        />
      ) : null}
    </>
  );
}
