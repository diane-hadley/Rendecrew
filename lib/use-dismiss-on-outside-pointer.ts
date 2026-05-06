import { type RefObject, useEffect } from "react";

/** Close a floating panel when the user presses down outside `ref`. */
export function useDismissOnOutsidePointer<T extends HTMLElement>(
  ref: RefObject<T | null>,
  open: boolean,
  setOpen: (next: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const el = ref.current;
      if (!el?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, ref, setOpen]);
}
