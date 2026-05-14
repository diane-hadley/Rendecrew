"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { MAX_SECTION_LEN, UNCATEGORIZED_SENTINEL } from "./constants";

type PackingSortableSectionHeaderProps = {
  sortId: string;
  colCount: number;
  label: string;
  trailing: ReactNode;
  /** When true, named sections render an inline title field (not used for Uncategorized). */
  canEditTitle?: boolean;
  onCommitSectionTitle?: (
    sectionId: string,
    raw: string,
    previousTitle: string,
  ) => boolean;
};

/**
 * Section headers stay in `SortableContext` as droppable targets for item DnD, but are never
 * draggable in the main table (FR-3 — use “Reorder sections” instead).
 */

export function PackingSortableSectionHeader({
  sortId,
  colCount,
  label,
  trailing,
  canEditTitle = false,
  onCommitSectionTitle,
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

  const body = sortId.startsWith("s:") ? sortId.slice(2) : "";
  const sectionIdForEdit =
    body && body !== UNCATEGORIZED_SENTINEL ? body : null;
  const showField = Boolean(
    canEditTitle && sectionIdForEdit && onCommitSectionTitle,
  );

  const titleControl = showField ? (
    <input
      type="text"
      key={`${sectionIdForEdit}:${label}`}
      defaultValue={label}
      maxLength={MAX_SECTION_LEN}
      aria-label="Section name"
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        const ok =
          onCommitSectionTitle?.(sectionIdForEdit!, el.value, label) ?? true;
        if (!ok) el.value = label;
      }}
      className="w-full min-w-32 border-0 bg-transparent px-0 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:text-gray-100 dark:focus:ring-blue-400"
    />
  ) : (
    <span className="text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
      {label}
    </span>
  );

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
            {titleControl}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {trailing}
          </div>
        </div>
      </td>
    </tr>
  );
}
