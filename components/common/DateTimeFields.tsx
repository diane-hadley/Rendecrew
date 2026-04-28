"use client";

import { useEffect } from "react";

import {
  joinDatetimeLocal,
  snapDatetimeLocalToMinutes,
  splitDatetimeLocal,
} from "@/lib/datetime-local";

/** Matches CreateEventForm / EditEventForm text inputs */
const fieldClass =
  "w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400";

const MINUTES_FIFTEEN = [0, 15, 30, 45].map((n) => String(n).padStart(2, "0"));

function timeLabel(h24: number, m: number): string {
  const minute = String(m).padStart(2, "0");
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${minute} ${period}`;
}

const TIME_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    for (const mm of MINUTES_FIFTEEN) {
      const value = `${String(h).padStart(2, "0")}:${mm}`;
      out.push({ value, label: timeLabel(h, Number(mm)) });
    }
  }
  return out;
})();

export type DateTimeFieldsProps = {
  id: string;
  label: string;
  value: string;
  onChange: (combined: string) => void;
  disabled?: boolean;
  hideSubLabels?: boolean;
};

export function DateTimeFields({
  id,
  label,
  value,
  onChange,
  disabled,
  hideSubLabels = false,
}: DateTimeFieldsProps) {
  const snapped = snapDatetimeLocalToMinutes(value, 15);
  const { date, time } = splitDatetimeLocal(snapped);
  const timeValue = time || "00:00";

  useEffect(() => {
    if (disabled) return;
    if (!value.trim()) return;
    if (snapped !== value) onChange(snapped);
  }, [disabled, onChange, snapped, value]);

  return (
    <div className="min-w-0">
      {label.trim() ? (
        <div className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          {label}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          {!hideSubLabels ? (
            <label
              htmlFor={`${id}-date`}
              className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Date
            </label>
          ) : null}
          <input
            id={`${id}-date`}
            type="date"
            aria-label={hideSubLabels ? "Date" : undefined}
            disabled={disabled}
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              if (!d) {
                onChange("");
                return;
              }
              const next = joinDatetimeLocal(d, time);
              onChange(snapDatetimeLocalToMinutes(next, 15));
            }}
            className={fieldClass}
          />
        </div>

        <div className="min-w-0">
          {!hideSubLabels ? (
            <label
              htmlFor={`${id}-time`}
              className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Time
            </label>
          ) : null}
          <select
            id={`${id}-time`}
            aria-label="Time"
            disabled={disabled || !date}
            value={timeValue}
            onChange={(e) => {
              if (!date) return;
              const next = joinDatetimeLocal(date, e.target.value);
              onChange(snapDatetimeLocalToMinutes(next, 15));
            }}
            className={fieldClass}
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
