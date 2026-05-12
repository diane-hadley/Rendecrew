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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";

export type EditSectionRow = { id: string; title: string };

export function EditSectionsModal({
  titleId,
  title = "Edit sections",
  rows,
  setRows,
  maxTitleLength,
  inlineError,
  onCancel,
  onDone,
}: {
  titleId: string;
  title?: string;
  rows: EditSectionRow[];
  setRows: Dispatch<SetStateAction<EditSectionRow[]>>;
  maxTitleLength: number;
  /** Shown inside the dialog (e.g. save/sync failures while this modal is open). */
  inlineError?: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onModalDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const a = String(active.id);
      const o = String(over.id);
      setRows((prev) => {
        const oldIndex = prev.findIndex((r) => r.id === a);
        const newIndex = prev.findIndex((r) => r.id === o);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [setRows],
  );

  const moveBy = useCallback(
    (id: string, delta: number) => {
      setRows((prev) => {
        const i = prev.findIndex((r) => r.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        return arrayMove(prev, i, j);
      });
    },
    [setRows],
  );

  const orderedIds = rows.map((r) => r.id);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-lg dark:border-gray-600 dark:bg-gray-900">
        <h3
          id={titleId}
          className="text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          {title}
        </h3>

        {inlineError ? (
          <p
            className="mt-3 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {inlineError}
          </p>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onModalDragEnd}
        >
          <SortableContext
            items={orderedIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 list-none space-y-2 p-0">
              {rows.map((r, index) => (
                <EditSectionsModalRow
                  key={r.id}
                  id={r.id}
                  title={r.title}
                  index={index}
                  total={orderedIds.length}
                  maxTitleLength={maxTitleLength}
                  onTitleChange={(next) =>
                    setRows((prev) =>
                      prev.map((p) =>
                        p.id === r.id ? { ...p, title: next } : p,
                      ),
                    )
                  }
                  onDelete={() =>
                    setRows((prev) => prev.filter((p) => p.id !== r.id))
                  }
                  onMoveUp={() => moveBy(r.id, -1)}
                  onMoveDown={() => moveBy(r.id, 1)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: crypto.randomUUID(), title: "New section" },
              ])
            }
            className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Add section
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDone}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditSectionsModalRow({
  id,
  title,
  index,
  total,
  maxTitleLength,
  onTitleChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  title: string;
  index: number;
  total: number;
  maxTitleLength: number;
  onTitleChange: (next: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-950"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded border border-transparent p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        aria-label={`Drag to reorder ${title}`}
        {...attributes}
        {...listeners}
      >
        ⣿
      </button>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        maxLength={maxTitleLength}
        className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
        aria-label="Section title"
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-600/60 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        Delete
      </button>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={index <= 0}
          onClick={onMoveUp}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-label={`Move ${title} up`}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index >= total - 1}
          onClick={onMoveDown}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-label={`Move ${title} down`}
        >
          ↓
        </button>
      </div>
    </li>
  );
}
