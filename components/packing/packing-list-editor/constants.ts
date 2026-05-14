/** Mirrors `MAX_SECTION_LEN` in `@/lib/packing-list` (avoid importing server lib in client). */
export const MAX_SECTION_LEN = 120;

export const UNCATEGORIZED_SENTINEL = "__uncategorized__";
/** Must stay aligned with `MAX_SECTIONS` in `@/lib/packing-list`. */
export const MAX_PACKING_SECTIONS = 100;

export const PACKING_VIEW_TOGGLE_SHELL =
  "inline-flex overflow-hidden rounded-lg border border-gray-200 bg-gray-200/70 dark:border-gray-700 dark:bg-gray-800/70";
export const PACKING_VIEW_TOGGLE_BTN_PAD = "px-3 py-1.5 text-sm";
export const PACKING_VIEW_TOGGLE_SELECTED =
  "bg-white font-semibold text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100";
export const PACKING_VIEW_TOGGLE_UNSELECTED =
  "bg-gray-200/70 font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-gray-50";
export const PACKING_VIEW_TOGGLE_DIVIDER =
  "border-l border-gray-200 dark:border-gray-700";

export const packingListDndAccessibility = {
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
