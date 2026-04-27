"use client";

import {
  hour12PeriodToHour24,
  hour24ToHour12AndPeriod,
  joinDatetimeLocal,
  snapDatetimeLocalToFiveMinutes,
  splitDatetimeLocal,
  splitTimeToHourMinuteFive,
} from "@/lib/datetime-local";

/** Matches CreateEventForm / EditEventForm text inputs */
const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400";

const chevron =
  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%236b7280%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')] " +
  "bg-[length:0.875rem] bg-[right_0.4rem_center] bg-no-repeat " +
  "dark:bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%239ca3af%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')]";

/** Tight selects: centered value, minimal side padding, room only for chevron on the right */
const selectTightClass =
  `box-border min-h-[2.5rem] shrink-0 appearance-none border-0 bg-white py-2 text-center text-sm font-medium tabular-nums text-gray-900 ` +
  `pl-1 pr-6 ${chevron} ` +
  `transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 ` +
  `disabled:cursor-not-allowed disabled:opacity-50 ` +
  `dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800`;

const selectPeriodTightClass =
  `box-border min-h-[2.5rem] shrink-0 appearance-none border-0 bg-white py-2 text-center text-sm font-semibold tracking-wide text-gray-900 ` +
  `pl-1 pr-6 ${chevron} ` +
  `transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 ` +
  `disabled:cursor-not-allowed disabled:opacity-50 ` +
  `dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800`;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES_FIVE = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((n) =>
  String(n).padStart(2, "0"),
);
const PERIODS = ["AM", "PM"] as const;

export type DateTimeFieldsProps = {
  id: string;
  label: string;
  value: string;
  onChange: (combined: string) => void;
  disabled?: boolean;
};

/**
 * Date + 12-hour time with 5-minute steps (stored as `YYYY-MM-DDTHH:mm` 24h).
 * Supports both typing time and scrolling selects.
 */
export function DateTimeFields({
  id,
  label,
  value,
  onChange,
  disabled,
}: DateTimeFieldsProps) {
  const { date, time } = splitDatetimeLocal(value);
  const { hour: hour24, minute } = splitTimeToHourMinuteFive(time || "00:00");
  const { hour12, period } = hour24ToHour12AndPeriod(hour24);

  const applyTime = (
    nextHour12: string,
    nextMinute: string,
    nextPeriod: (typeof PERIODS)[number],
  ) => {
    if (!date) return;
    const h24 = hour12PeriodToHour24(nextHour12, nextPeriod);
    const next = joinDatetimeLocal(date, `${h24}:${nextMinute}`);
    onChange(snapDatetimeLocalToFiveMinutes(next));
  };

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
        {label}
      </legend>

      <div className="flex flex-col gap-3">
        <div className="w-full min-w-0">
          <label
            htmlFor={`${id}-date`}
            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            disabled={disabled}
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              if (!d) {
                onChange("");
                return;
              }
              const next = joinDatetimeLocal(d, time);
              onChange(snapDatetimeLocalToFiveMinutes(next));
            }}
            className={fieldClass}
          />
        </div>

        <div className="w-full min-w-0">
          <span
            id={`${id}-time-heading`}
            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Time
          </span>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id={`${id}-time`}
              type="time"
              step={300}
              disabled={disabled || !date}
              value={time || "00:00"}
              aria-label={`${label}, time`}
              onChange={(e) => {
                if (!date) return;
                const t = e.target.value;
                const next = joinDatetimeLocal(date, t);
                onChange(snapDatetimeLocalToFiveMinutes(next));
              }}
              className={`${fieldClass} max-w-[10rem]`}
            />
            <div
              className="flex h-10 w-fit max-w-full flex-nowrap items-stretch overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-900 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-blue-500 dark:[&:has(:focus-visible)]:ring-blue-400"
              role="group"
              aria-labelledby={`${id}-time-heading`}
            >
              <select
                id={`${id}-hour`}
                aria-label={`${label}, hour`}
                disabled={disabled || !date}
                value={hour12}
                onChange={(e) => applyTime(e.target.value, minute, period)}
                className={`${selectTightClass} w-12 rounded-l-md`}
              >
                {HOURS_12.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span
                className="flex w-[1.125rem] shrink-0 items-center justify-center border-x border-gray-200 bg-gray-50/90 text-xs font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-500"
                aria-hidden
              >
                :
              </span>
              <select
                id={`${id}-minute`}
                aria-label={`${label}, minute`}
                disabled={disabled || !date}
                value={minute}
                onChange={(e) => applyTime(hour12, e.target.value, period)}
                className={`${selectTightClass} w-14`}
              >
                {MINUTES_FIVE.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                id={`${id}-period`}
                aria-label={`${label}, AM or PM`}
                disabled={disabled || !date}
                value={period}
                onChange={(e) =>
                  applyTime(
                    hour12,
                    minute,
                    e.target.value as (typeof PERIODS)[number],
                  )
                }
                className={`${selectPeriodTightClass} w-16 rounded-r-md`}
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
