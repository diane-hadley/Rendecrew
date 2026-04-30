"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APP_DEFAULT_TIME_ZONE,
  getTimezoneSelectChoices,
  normalizeTimeZone,
} from "@/lib/event-datetime";

type TimeZonePickerModalProps = {
  open: boolean;
  title: string;
  startLabel: string;
  endLabel: string;
  startTimeZone: string;
  endTimeZone: string;
  allowSeparateStartEnd?: boolean;
  onClose: () => void;
  onApply: (next: {
    startTimeZone: string;
    endTimeZone: string;
    useSeparateEndTimeZone: boolean;
  }) => void;
};

function resolvedBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export function TimeZonePickerModal({
  open,
  title,
  startLabel,
  endLabel,
  startTimeZone,
  endTimeZone,
  allowSeparateStartEnd = true,
  onClose,
  onApply,
}: TimeZonePickerModalProps) {
  const singleTimeZoneMode = !allowSeparateStartEnd;
  const [useSeparate, setUseSeparate] = useState(false);
  const [draftStart, setDraftStart] = useState(startTimeZone);
  const [draftEnd, setDraftEnd] = useState(endTimeZone);

  useEffect(() => {
    if (!open) return;
    setUseSeparate(allowSeparateStartEnd && startTimeZone !== endTimeZone);
    setDraftStart(startTimeZone);
    setDraftEnd(endTimeZone);
  }, [open, allowSeparateStartEnd, startTimeZone, endTimeZone]);

  const normalizedStart = useMemo(
    () => normalizeTimeZone(draftStart, APP_DEFAULT_TIME_ZONE),
    [draftStart],
  );
  const normalizedEnd = useMemo(
    () => normalizeTimeZone(draftEnd, normalizedStart),
    [draftEnd, normalizedStart],
  );

  const groupedStart = useMemo(
    () => getTimezoneSelectChoices(normalizedStart),
    [normalizedStart],
  );
  const groupedEnd = useMemo(
    () => getTimezoneSelectChoices(normalizedEnd),
    [normalizedEnd],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </div>
          <button
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {allowSeparateStartEnd ? (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="checkbox"
                checked={useSeparate}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseSeparate(next);
                  if (!next) setDraftEnd(draftStart);
                }}
                className="mt-1"
              />
              Use separate start and end time zones
            </label>
          ) : null}

          {singleTimeZoneMode ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                {startLabel}
              </label>
              <select
                value={draftStart}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraftStart(next);
                  setDraftEnd(next);
                }}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
              >
                {groupedStart.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  {startLabel}
                </label>
                <select
                  value={draftStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraftStart(next);
                    if (!useSeparate) setDraftEnd(next);
                  }}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                >
                  {groupedStart.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  {endLabel}
                </label>
                <select
                  value={useSeparate ? draftEnd : draftStart}
                  disabled={!useSeparate}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                >
                  {groupedEnd.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={() => {
                const tz = normalizeTimeZone(
                  resolvedBrowserTimeZone(),
                  APP_DEFAULT_TIME_ZONE,
                );
                setDraftStart(tz);
                setDraftEnd(tz);
                setUseSeparate(false);
              }}
            >
              Use current time zone
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => {
                  onApply({
                    startTimeZone: normalizedStart,
                    endTimeZone:
                      singleTimeZoneMode || !useSeparate
                        ? normalizedStart
                        : normalizedEnd,
                    useSeparateEndTimeZone: singleTimeZoneMode
                      ? false
                      : useSeparate,
                  });
                  onClose();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
