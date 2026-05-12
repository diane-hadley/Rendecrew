import type { Dispatch, SetStateAction } from "react";
import { EditSectionsModal, type EditSectionRow } from "./EditSectionsModal";

/**
 * Same UX as Group Packing’s “Reorder sections”: named categories only;
 * Uncategorized stays fixed at the bottom of the list.
 */
export function PersonalPackingEditSectionsModal({
  rows,
  setRows,
  onCancel,
  onDone,
}: {
  rows: EditSectionRow[];
  setRows: Dispatch<SetStateAction<EditSectionRow[]>>;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <EditSectionsModal
      titleId="personal-packing-edit-sections-title"
      rows={rows}
      setRows={setRows}
      maxTitleLength={120}
      onCancel={onCancel}
      onDone={onDone}
    />
  );
}
