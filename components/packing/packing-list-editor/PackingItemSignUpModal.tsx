"use client";

import { createPortal } from "react-dom";
import type { PackingSignupMemberOption } from "./types";

type PackingItemSignUpModalProps = {
  titleId: string;
  itemName: string;
  onClose: () => void;
  isGuest: boolean;
  showMemberSelect: boolean;
  mySu: boolean;
  memberValue: string;
  onMemberChange: (v: string) => void;
  quantityStr: string;
  onQuantityChange: (v: string) => void;
  otherMembers: readonly PackingSignupMemberOption[];
  quantityMax: number | undefined;
  onConfirm: () => void;
  confirmDisabled: boolean;
};

export function PackingItemSignUpModal({
  titleId,
  itemName,
  onClose,
  isGuest,
  showMemberSelect,
  mySu,
  memberValue,
  onMemberChange,
  quantityStr,
  onQuantityChange,
  otherMembers,
  quantityMax,
  onConfirm,
  confirmDisabled,
}: PackingItemSignUpModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-lg dark:border-gray-600 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id={titleId}
          className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
          title={itemName}
        >
          Sign up to bring
          <span className="font-normal text-gray-600 dark:text-gray-400">
            {" "}
            — {itemName}
          </span>
        </h3>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {!isGuest && showMemberSelect ? (
            <label className="min-w-0 flex-1 basis-[12rem]">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Member
              </span>
              <select
                value={memberValue}
                onChange={(e) => onMemberChange(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                aria-label="Who will bring this"
              >
                {mySu ? (
                  <option value="">Choose...</option>
                ) : (
                  <option value="__me__">Me</option>
                )}
                {otherMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : !isGuest ? (
            <div className="min-w-0 flex-1 basis-[12rem]">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Member
              </span>
              <div className="rounded-md border border-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                Me
              </div>
            </div>
          ) : null}

          <label
            className={
              isGuest ? "w-full sm:w-32" : "w-full shrink-0 sm:w-32 sm:basis-32"
            }
          >
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Quantity
            </span>
            <input
              type="number"
              min={1}
              max={quantityMax}
              value={quantityStr}
              onChange={(e) => onQuantityChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              aria-label="How many to bring"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
